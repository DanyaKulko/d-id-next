export type TriggerType = "silence" | "interrupt" | "error";

const DEFAULT_LANGUAGE = "en-US";

type PhraseBank = Record<TriggerType, Record<string, string[]>>;

const TRIGGER_PHRASES: PhraseBank = {
  silence: {
    "en-US": [
      "Still with me? Ask me anything.",
      "Take your time — what would you like to know?",
      "I'm right here whenever you're ready.",
      "Got a question for me?",
      "Feel free to ask me anything at all.",
    ],
    "ru-RU": [
      "Ты ещё здесь? Спрашивай о чём угодно.",
      "Не торопись — что бы ты хотел узнать?",
      "Я здесь, когда будешь готов.",
      "Есть вопрос ко мне?",
      "Спрашивай меня о чём угодно.",
    ],
    "es-ES": [
      "¿Sigues ahí? Pregúntame lo que quieras.",
      "Tómate tu tiempo, ¿qué te gustaría saber?",
      "Aquí estoy cuando estés listo.",
      "¿Tienes alguna pregunta para mí?",
      "Pregúntame lo que sea.",
    ],
    "fr-FR": [
      "Toujours là ? Pose-moi n'importe quelle question.",
      "Prends ton temps — que veux-tu savoir ?",
      "Je suis là quand tu es prêt.",
      "Tu as une question pour moi ?",
      "N'hésite pas à me demander ce que tu veux.",
    ],
    "id-ID": [
      "Masih di sana? Tanyakan apa saja.",
      "Santai saja — apa yang ingin kamu tahu?",
      "Aku di sini kapan pun kamu siap.",
      "Ada pertanyaan untukku?",
      "Tanya aku apa saja.",
    ],
    "hi-IN": [
      "अभी भी यहाँ हो? मुझसे कुछ भी पूछो।",
      "जल्दी मत करो — तुम क्या जानना चाहोगे?",
      "जब तैयार हो, मैं यहीं हूँ।",
      "मेरे लिए कोई सवाल है?",
      "मुझसे कुछ भी पूछ सकते हो।",
    ],
    "mr-IN": [
      "अजून इथे आहेस का? मला काहीही विचार.",
      "घाई करू नकोस — तुला काय जाणून घ्यायचंय?",
      "तू तयार असशील तेव्हा मी इथेच आहे.",
      "माझ्यासाठी काही प्रश्न आहे का?",
      "मला काहीही विचारू शकतोस.",
    ],
  },
  interrupt: {
    "en-US": [
      "Yes? Go ahead.",
      "Sure — what is it?",
      "I'm listening.",
      "Go on, I'm all ears.",
      "Of course, what would you like?",
    ],
    "ru-RU": [
      "Да? Слушаю.",
      "Конечно, что такое?",
      "Я весь внимание.",
      "Говори, я слушаю.",
      "Да, что бы ты хотел?",
    ],
    "es-ES": [
      "¿Sí? Adelante.",
      "Claro, ¿qué pasa?",
      "Te escucho.",
      "Dime, soy todo oídos.",
      "Por supuesto, ¿qué necesitas?",
    ],
    "fr-FR": [
      "Oui ? Vas-y.",
      "Bien sûr, qu'y a-t-il ?",
      "Je t'écoute.",
      "Dis-moi tout, je suis tout ouïe.",
      "Bien sûr, que veux-tu ?",
    ],
    "id-ID": [
      "Ya? Silakan.",
      "Tentu, ada apa?",
      "Aku dengar.",
      "Lanjut, aku menyimak.",
      "Tentu, apa yang kamu mau?",
    ],
    "hi-IN": [
      "हाँ? बोलो।",
      "ज़रूर, क्या बात है?",
      "मैं सुन रहा हूँ।",
      "बताओ, मैं यहीं हूँ।",
      "बेशक, तुम क्या चाहते हो?",
    ],
    "mr-IN": [
      "हं? बोल.",
      "नक्कीच, काय झालं?",
      "मी ऐकतोय.",
      "बोल, मी इथेच आहे.",
      "नक्कीच, तुला काय हवंय?",
    ],
  },
  error: {
    "en-US": [
      "Sorry, I hit a small technical snag. Let's try that again.",
      "Hmm, something went wrong on my end. Could you repeat that?",
      "Apologies — a little glitch. Give it another go.",
      "Oops, a technical hiccup. Let's try once more.",
      "Sorry about that, my connection stumbled. Try again?",
    ],
    "ru-RU": [
      "Извини, небольшая техническая заминка. Давай ещё раз.",
      "Хм, что-то пошло не так с моей стороны. Повторишь?",
      "Прошу прощения, небольшой сбой. Попробуй снова.",
      "Упс, технический сбой. Давай ещё разок.",
      "Извини, связь подвисла. Попробуем ещё раз?",
    ],
    "es-ES": [
      "Perdona, tuve un pequeño fallo técnico. Probemos de nuevo.",
      "Mmm, algo salió mal por mi parte. ¿Puedes repetir?",
      "Disculpa, un pequeño error. Inténtalo otra vez.",
      "Ups, un fallo técnico. Probemos una vez más.",
      "Perdona, mi conexión falló. ¿Lo intentamos de nuevo?",
    ],
    "fr-FR": [
      "Désolé, un petit souci technique. On réessaie ?",
      "Hmm, quelque chose a coincé de mon côté. Tu peux répéter ?",
      "Pardon, un petit bug. Réessaie.",
      "Oups, un pépin technique. On recommence.",
      "Désolé, ma connexion a flanché. On réessaie ?",
    ],
    "id-ID": [
      "Maaf, ada gangguan teknis kecil. Coba lagi, yuk.",
      "Hmm, ada yang salah di sisiku. Bisa ulangi?",
      "Maaf, sedikit error. Coba sekali lagi.",
      "Ups, gangguan teknis. Ayo coba lagi.",
      "Maaf, koneksiku tersendat. Coba lagi?",
    ],
    "hi-IN": [
      "माफ़ करना, थोड़ी तकनीकी दिक्कत हो गई। फिर से कोशिश करें।",
      "हम्म, मेरी तरफ़ से कुछ गड़बड़ हुई। दोबारा कहोगे?",
      "क्षमा करें, छोटी सी खराबी। फिर से कोशिश करो।",
      "ओह, तकनीकी रुकावट। चलो फिर से कोशिश करें।",
      "माफ़ी, मेरा कनेक्शन अटक गया। फिर से कोशिश करें?",
    ],
    "mr-IN": [
      "माफ कर, थोडी तांत्रिक अडचण आली. पुन्हा प्रयत्न करूया.",
      "हम्म, माझ्याकडून काहीतरी चुकलं. पुन्हा सांगशील?",
      "क्षमा कर, थोडासा बिघाड. पुन्हा प्रयत्न कर.",
      "अरे, तांत्रिक अडथळा. चल पुन्हा प्रयत्न करूया.",
      "माफ कर, माझं कनेक्शन अडकलं. पुन्हा प्रयत्न करूया?",
    ],
  },
};

export const pickTriggerPhrase = (
  type: TriggerType,
  language?: string,
): string => {
  const bank = TRIGGER_PHRASES[type];
  const variants =
    (language && bank[language]) ||
    (language &&
      bank[
        Object.keys(bank).find((k) =>
          k.startsWith(`${language.slice(0, 2)}-`),
        ) ?? ""
      ]) ||
    bank[DEFAULT_LANGUAGE];
  if (!variants || variants.length === 0) return "";
  const index = Math.floor(Math.random() * variants.length);
  return variants[index];
};
