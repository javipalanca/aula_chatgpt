export const ETHICS_SCENARIOS = [
  { text: "Pedirle a ChatGPT que haga tu examen de mañana y te pase las respuestas.", good: false, why: "Copiar en exámenes es deshonesto y suele violar normas académicas. Mejor úsalo para repasar o generar ejercicios de práctica.", evaluation: 'mcq' },
  { text: "Pedir ejemplos de cómo citar correctamente fuentes en un trabajo.", good: true, why: "Promueve el aprendizaje y el respeto por la propiedad intelectual.", evaluation: 'mcq' },
  { text: "Solicitar un texto con datos personales de un compañero/a para publicarlo.", good: false, why: "La privacidad es clave: nunca pidas ni compartas datos personales sin permiso.", evaluation: 'mcq' },
  { text: "Pedir una explicación paso a paso de un tema (con analogías) para entenderlo mejor.", good: true, why: "Excelente uso: comprensión, ejemplos, analogías y diferentes enfoques didácticos.", evaluation: 'mcq' },
  { text: "Pedir que escriba tu comentario de clase haciéndose pasar por ti sin decírselo al profe.", good: false, why: "Engañar sobre la autoría no es ético. Puedes pedir ayuda para estructurar ideas, pero escribe tú.", evaluation: 'mcq' },
  { text: "Solicitar ideas para un proyecto creativo (guion de vídeo, experimento, cómic).", good: true, why: "La IA como lluvia de ideas y co-creación es un buen uso si luego lo adaptas y citas si procede.", evaluation: 'mcq' },
  { text: "Intentar vulnerar contraseñas o saltarte medidas de seguridad usando la IA.", good: false, why: "Prohibido y peligroso. El uso responsable evita actividades dañinas o ilegales.", evaluation: 'mcq' },
  { text: "Pedir una rúbrica para autoevaluar tu trabajo antes de entregarlo.", good: true, why: "Fomenta la autonomía y la mejora progresiva del propio trabajo.", evaluation: 'mcq' },
  { text: "Subir la foto de un amigo sin su permiso para pedir descripciones detalladas.", good: false, why: "Respeta la privacidad e imagen de los demás. Pide consentimiento siempre.", evaluation: 'mcq' },
  { text: "Pedir un resumen de un texto que ya has leído para comprobar si lo has entendido.", good: true, why: "Buen uso: comprobación, repaso y aprendizaje activo.", evaluation: 'mcq' },
];

export const VERIF_QUIZ = [
  { q: "Si ChatGPT te da un dato estadístico (por ejemplo, población de una ciudad), ¿qué haces?", options: ["Lo copio tal cual, seguro que está bien.", "Lo cito como 'según una IA' y ya está.", "Busco al menos 2 fuentes fiables (web oficial, medios de calidad) para verificarlo."], a: 2, explain: "Los datos pueden estar desactualizados o ser incorrectos: contrasta con fuentes fiables.", evaluation: 'mcq' },
  { q: "¿Cuál es una buena manera de pedir referencias?", options: ["\"Dame fuentes reales y enlazables\" y luego comprobarlas.", "No hace falta fuentes si suena convincente.", "Pedir que invente bibliografía si no existe."], a: 0, explain: "Solicita fuentes concretas y compruébalas; desconfía de bibliografías inventadas.", evaluation: 'mcq' },
  { q: "Si sospechas que hay un error en la respuesta, ¿qué haces?", options: ["Ignoro la sospecha: seguro que no es importante.", "Pregunto de nuevo, pido que razone paso a paso o reformulo la pregunta.", "Me enfado con la IA."], a: 1, explain: "Reformular, pedir pasos o contrastar suele mejorar la calidad y detectar fallos.", evaluation: 'mcq' },
  { q: "¿Qué no deberías compartir cuando pides ayuda?", options: ["Datos personales sensibles o identificadores.", "El enunciado de un ejercicio.", "Tus dudas concretas."], a: 0, explain: "Evita datos sensibles (DNI, direcciones, contraseñas, salud, etc.).", evaluation: 'mcq' },
  { q: "¿Cómo citar el uso de IA en un trabajo escolar?", options: ["No hace falta decir nada.", "Añadir una nota: 'He usado ChatGPT para ideas/esquema/borrador y yo revisé y reescribí'.", "Decir que todo es de la IA y yo no hice nada."], a: 1, explain: "La transparencia es clave: explica cómo la usaste y qué parte es tuya.", evaluation: 'mcq' },
];

export const BAD_PROMPTS = [
  { id: 1, bad: "Explícame historia", tip: "Sé concreto: tema, curso/edad, extensión, formato (lista, esquema), ejemplos y tono.", evaluation: 'prompt', duration: 180 },
  { id: 2, bad: "Haz mi comentario de texto de La casa de Bernarda Alba", tip: "Pide guía: estructura, preguntas para reflexionar, vocabulario, y escribe tu versión.", evaluation: 'prompt', duration: 180 },
  { id: 3, bad: "Dame un trabajo de 10 páginas sobre la fotosíntesis", tip: "Divide: índice propuesto + resumen por apartados + fuentes para ampliar.", evaluation: 'prompt', duration: 180 },
];

export const RED_FLAGS_SAMPLE = [{
  answer: "La Revolución de los Pingüinos empezó en 1789 en Francia, cuando los pingüinos derrocaron a Luis XVI. Según el Instituto Francés de Pingüinología, hubo 123 castillos de hielo tomados por asalto. Todo terminó con el Tratado de Hielo de 1795 firmado en la Antártida.",
  checks: [ { id: 'hechos', label: 'Hay datos que requieren verificación externa' }, { id: 'inventado', label: 'Detecto elementos inventados o absurdos' }, { id: 'fuentes', label: 'Faltan fuentes reales o enlaces comprobables' }, { id: 'tono', label: 'El tono no es adecuado para un trabajo escolar' }, { id: 'privacidad', label: 'Incluye datos personales innecesarios' } ],
  correct: ['hechos','inventado','fuentes','tono'],
  evaluation: 'redflags'
}];
