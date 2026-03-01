// ============================================
// SABI - Core Message Handler
// ============================================
const userService = require('./userService');
const whatsappService = require('./whatsappService');
const transcriptionService = require('./transcriptionService');
const intentService = require('./intentService');
const responseService = require('./responseService');
const ttsService = require('./ttsService');
const analyticsService = require('./analyticsService');
const logger = require('../utils/logger');

const ONBOARDING_LANGUAGES = ['yoruba', 'pidgin', 'igbo', 'hausa', 'english'];
const NIGERIAN_STATES = [
  'lagos', 'abuja', 'oyo', 'rivers', 'kano', 'kaduna', 'ogun', 'delta',
  'anambra', 'imo', 'enugu', 'akwa ibom', 'edo', 'kwara', 'osun', 'ondo',
  'ekiti', 'abia', 'ebonyi', 'cross river', 'benue', 'kogi', 'nassarawa',
  'plateau', 'niger', 'kebbi', 'sokoto', 'zamfara', 'katsina', 'jigawa',
  'bauchi', 'gombe', 'yobe', 'borno', 'adamawa', 'taraba'
];

class MessageHandler {
  async handle({ message, phone, displayName }) {
    const startTime = Date.now();

    try {
      // Get or create user
      let user = await userService.getOrCreateUser(phone);

      // Mark typing indicator
      await whatsappService.sendTypingIndicator(phone);

      // Handle different message types
      let inputText = '';
      let inputType = 'text';

      if (message.type === 'text') {
        inputText = message.text.body.trim();
      } else if (message.type === 'audio') {
        // Download and transcribe voice note
        inputType = 'voice';
        const audioUrl = await whatsappService.getMediaUrl(message.audio.id);
        const audioBuffer = await whatsappService.downloadMedia(audioUrl);
        inputText = await transcriptionService.transcribe(audioBuffer, user.preferred_language);
        logger.info(`Transcribed voice: "${inputText.substring(0, 50)}..."`);
      } else if (message.type === 'image') {
        await whatsappService.sendTextMessage(phone,
          "Sabi no dey read pictures yet o. Send voice or text message. We dey work on am! 😊"
        );
        return;
      } else {
        // Unsupported type
        return;
      }

      if (!inputText) return;

      // ── ONBOARDING FLOW ─────────────────────
      if (!user.onboarding_complete) {
        await this.handleOnboarding(user, phone, inputText, displayName);
        return;
      }

      // ── STOP/UNSUBSCRIBE ────────────────────
      if (inputText.toUpperCase().trim() === 'STOP') {
        await userService.updateUser(phone, { opted_daily_updates: false });
        await whatsappService.sendTextMessage(phone,
          "Ok, we don remove you from daily updates. You fit reply START any time to come back. Sabi still dey here for you! 🙏"
        );
        return;
      }

      if (inputText.toUpperCase().trim() === 'START') {
        await userService.updateUser(phone, { opted_daily_updates: true });
        await whatsappService.sendTextMessage(phone,
          "Welcome back! You go start receive morning updates again from 7am. 🌅🇳🇬"
        );
        return;
      }

      // ── MAIN INTENT FLOW ────────────────────
      const { intent, entities } = await intentService.classify(inputText, user.preferred_language);
      logger.info(`Intent: ${intent}, language: ${user.preferred_language}`);

      // Generate response
      const { text: responseText, isCached } = await responseService.generate({
        intent,
        entities,
        query: inputText,
        user,
        language: user.preferred_language
      });

      // Update user's last query
      await userService.updateUser(phone, { last_query: new Date().toISOString() });

      // Generate voice note
      let voiceBuffer = null;
      try {
        voiceBuffer = await ttsService.synthesize(responseText, user.preferred_language);
      } catch (ttsErr) {
        logger.warn('TTS failed, sending text only:', ttsErr.message);
      }

      // Send voice + text
      if (voiceBuffer) {
        await whatsappService.sendAudioMessage(phone, voiceBuffer, `sabi_reply_${Date.now()}.ogg`);
        await whatsappService.sendTextMessage(phone,
          responseText + (isCached ? '\n\n_⚠️ This na yesterday data – check later for fresh one 👍_' : '')
        );
      } else {
        await whatsappService.sendTextMessage(phone,
          responseText + (isCached ? '\n\n_⚠️ This na yesterday data – check later for fresh one 👍_' : '')
        );
      }

      // Log analytics
      const responseTime = Date.now() - startTime;
      await analyticsService.log({
        phone,
        intent,
        language: user.preferred_language,
        inputType,
        queryText: inputText.substring(0, 200),
        responseTimeMs: responseTime,
        cacheHit: isCached
      });

    } catch (err) {
      logger.error('Message handling error:', err);
      try {
        await whatsappService.sendTextMessage(phone,
          "E be like something go wrong small. Try again or check your network. Sabi dey here! 🙏"
        );
      } catch (_) {}
    }
  }

  async handleOnboarding(user, phone, inputText, displayName) {
    const input = inputText.toLowerCase().trim();

    // Step 1: Just joined - send welcome
    if (!user.onboarding_step) {
      await userService.updateUser(phone, { onboarding_step: 'language' });
      await whatsappService.sendTextMessage(phone,
        `🇳🇬 *Welcome to Sabi!*\n\nSabi means to know. I dey here to help you with:\n• Market prices 🛒\n• Weather 🌤️\n• Government services 🏛️\n• Nigerian news 📰\n\nWetin you wan know today? Send voice or type.\n\nReply *Yoruba, Pidgin, Igbo, Hausa* or *English* to set your language.\nAlso tell me your area (e.g. Lagos, Ibadan, Abuja).`
      );
      return;
    }

    // Detect language preference
    const detectedLang = ONBOARDING_LANGUAGES.find(l => input.includes(l));
    const detectedState = NIGERIAN_STATES.find(s => input.includes(s));

    let updates = {};
    if (detectedLang) updates.preferred_language = detectedLang;
    if (detectedState) updates.state = detectedState;

    if (Object.keys(updates).length) {
      await userService.updateUser(phone, updates);
      user = { ...user, ...updates };
    }

    // Check if onboarding complete
    if (user.preferred_language && user.state) {
      await userService.updateUser(phone, {
        onboarding_complete: true,
        onboarding_step: null
      });

      const welcomeMsg = user.preferred_language === 'yoruba'
        ? `E kaabo! 🎉 Mo ti set Yoruba for ${user.state}. Kini o fe mọ loni? Send voice tabi text!`
        : user.preferred_language === 'igbo'
        ? `Nnọọ! 🎉 Eji m Igbo mee gị na ${user.state}. Gịnị chọrọ ị mara taa? Send voice ma ọ bụ text!`
        : user.preferred_language === 'hausa'
        ? `Barka da zuwa! 🎉 Na tsara Hausa na ${user.state}. Mene kake son sani yau? Aika murya ko rubutu!`
        : `You dey set! 🎉 Language: ${user.preferred_language}, Location: ${user.state}. Wetin you wan ask Sabi today? Send voice or type!`;

      await whatsappService.sendTextMessage(phone, welcomeMsg);
      await whatsappService.sendTextMessage(phone,
        '📣 You wan receive morning update (price + weather) by 7am? Reply *YES* to subscribe or *NO* to skip.'
      );
      await userService.updateUser(phone, { onboarding_step: 'broadcast' });
    } else {
      // Partial - ask for missing info
      if (!user.preferred_language) {
        await whatsappService.sendTextMessage(phone,
          'Which language e go sweet you? Reply: *Pidgin, Yoruba, Igbo, Hausa* or *English*'
        );
      } else if (!user.state) {
        await whatsappService.sendTextMessage(phone,
          'Which state/city you dey? (e.g. Lagos, Abuja, Ibadan, Kano)'
        );
      }
    }

    // Handle broadcast opt-in
    if (user.onboarding_step === 'broadcast') {
      if (input.includes('yes') || input.includes('ya') || input.includes('yep')) {
        await userService.updateUser(phone, { opted_daily_updates: true, onboarding_step: null, onboarding_complete: true });
        await whatsappService.sendTextMessage(phone,
          '✅ Sabi go send you morning update by 7am daily. Reply *STOP* any time to cancel. Oya, wetin you wan ask today? 🎙️'
        );
      } else {
        await userService.updateUser(phone, { opted_daily_updates: false, onboarding_step: null, onboarding_complete: true });
        await whatsappService.sendTextMessage(phone,
          '👍 No problem. You fit always reply *START* later to get updates. Ask me anything now! 🎙️'
        );
      }
    }
  }
}

module.exports = new MessageHandler();
