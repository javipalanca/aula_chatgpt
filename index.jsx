import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Sparkles,
  ShieldCheck,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  Star,
  RefreshCw,
  Award,
  Link as LinkIcon,
  HelpCircle,
  Target,
  Pencil,
  CheckCircle2,
  XCircle,
  Rocket,
  BookOpen,
  Timer,
  Settings,
} from "lucide-react";

/**
 * Aula ChatGPT — Juego y Taller Interactivo (ESO/Bach)
 * ----------------------------------------------------
 * Una aplicación de una sola página para enseñar BUENOS usos de ChatGPT
 *          <small className="block text-xs text-slate-500">Consejo: añade <b>criterios de calidad</b> (por ejemplo, &quot;si falta información, haz 3 preguntas primero&quot;).</small>de forma divertida y amena. Incluye:
 *  - Constructor de Prompts (Prompt Builder) con puntuación por buenas prácticas
 *  - Juego de Ética y Seguridad (escenarios: ¿Adecuado o No Adecuado?)
 *  - Reto de Verificación de Fuentes (quiz rápido)
 *  - Taller "Redacta Mejor" (mejora una mala petición)
 *  - Diagnóstico de Respuestas (marca señales de alerta)
 *  - Sistema de puntos, progreso y logros
 *
 * Diseño: TailwindCSS (preconfigurada en este entorno) + iconos lucide-react
 * No requiere backend ni conexión: todo se guarda en localStorage.
 */

// ----------------------------- Utilidades -----------------------------
const LS_KEY = "aula-chatgpt-progress-v1";

function clsx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function saveProgress(state) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {}
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function FancyCard({ children, className }) {
  return (
    <div
      className={clsx(
        "rounded-2xl shadow-lg bg-white/80 backdrop-blur border border-slate-200",
        "p-5 md:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Pill({ children, icon: Icon, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-green-100 text-green-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
    purple: "bg-purple-100 text-purple-700",
    red: "bg-rose-100 text-rose-700",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
        tones[tone],
      )}
    >
      {Icon && <Icon size={16} />}
      {children}
    </span>
  );
}

function Button({
  children,
  onClick,
  variant = "primary",
  className,
  type = "button",
  disabled,
}) {
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 text-white",
    ghost:
      "bg-transparent hover:bg-slate-100 text-slate-700 border border-slate-200",
    success: "bg-green-600 hover:bg-green-700 text-white",
    danger: "bg-rose-600 hover:bg-rose-700 text-white",
    warning: "bg-amber-500 hover:bg-amber-600 text-black",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition focus:outline-none",
        disabled ? "opacity-50 cursor-not-allowed" : variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

function ProgressBar({ value }) {
  return (
    <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
      <div
        className="h-full bg-blue-600 transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

// ----------------------------- Datos del Juego -----------------------------
const ETHICS_SCENARIOS = [
  {
    text: "Pedirle a ChatGPT que haga tu examen de mañana y te pase las respuestas.",
    good: false,
    why: "Copiar en exámenes es deshonesto y suele violar normas académicas. Mejor úsalo para repasar o generar ejercicios de práctica.",
  },
  {
    text: "Pedir ejemplos de cómo citar correctamente fuentes en un trabajo.",
    good: true,
    why: "Promueve el aprendizaje y el respeto por la propiedad intelectual.",
  },
  {
    text: "Solicitar un texto con datos personales de un compañero/a para publicarlo.",
    good: false,
    why: "La privacidad es clave: nunca pidas ni compartas datos personales sin permiso.",
  },
  {
    text: "Pedir una explicación paso a paso de un tema (con analogías) para entenderlo mejor.",
    good: true,
    why: "Excelente uso: comprensión, ejemplos, analogías y diferentes enfoques didácticos.",
  },
  {
    text: "Pedir que escriba tu comentario de clase haciéndose pasar por ti sin decírselo al profe.",
    good: false,
    why: "Engañar sobre la autoría no es ético. Puedes pedir ayuda para estructurar ideas, pero escribe tú.",
  },
  {
    text: "Solicitar ideas para un proyecto creativo (guion de vídeo, experimento, cómic).",
    good: true,
    why: "La IA como lluvia de ideas y co-creación es un buen uso si luego lo adaptas y citas si procede.",
  },
  {
    text: "Intentar vulnerar contraseñas o saltarte medidas de seguridad usando la IA.",
    good: false,
    why: "Prohibido y peligroso. El uso responsable evita actividades dañinas o ilegales.",
  },
  {
    text: "Pedir una rúbrica para autoevaluar tu trabajo antes de entregarlo.",
    good: true,
    why: "Fomenta la autonomía y la mejora progresiva del propio trabajo.",
  },
  {
    text: "Subir la foto de un amigo sin su permiso para pedir descripciones detalladas.",
    good: false,
    why: "Respeta la privacidad e imagen de los demás. Pide consentimiento siempre.",
  },
  {
    text: "Pedir un resumen de un texto que ya has leído para comprobar si lo has entendido.",
    good: true,
    why: "Buen uso: comprobación, repaso y aprendizaje activo.",
  },
];

const VERIF_QUIZ = [
  {
    q: "Si ChatGPT te da un dato estadístico (por ejemplo, población de una ciudad), ¿qué haces?",
    options: [
      "Lo copio tal cual, seguro que está bien.",
      "Lo cito como 'según una IA' y ya está.",
      "Busco al menos 2 fuentes fiables (web oficial, medios de calidad) para verificarlo.",
    ],
    a: 2,
    explain:
      "Los datos pueden estar desactualizados o ser incorrectos: contrasta con fuentes fiables.",
  },
  {
    q: "¿Cuál es una buena manera de pedir referencias?",
    options: [
      '"Dame fuentes reales y enlazables" y luego comprobarlas.',
      "No hace falta fuentes si suena convincente.",
      "Pedir que invente bibliografía si no existe.",
    ],
    a: 0,
    explain:
      "Solicita fuentes concretas y compruébalas; desconfía de bibliografías inventadas.",
  },
  {
    q: "Si sospechas que hay un error en la respuesta, ¿qué haces?",
    options: [
      "Ignoro la sospecha: seguro que no es importante.",
      "Pregunto de nuevo, pido que razone paso a paso o reformulo la pregunta.",
      "Me enfado con la IA.",
    ],
    a: 1,
    explain:
      "Reformular, pedir pasos o contrastar suele mejorar la calidad y detectar fallos.",
  },
  {
    q: "¿Qué no deberías compartir cuando pides ayuda?",
    options: [
      "Datos personales sensibles o identificadores.",
      "El enunciado de un ejercicio.",
      "Tus dudas concretas.",
    ],
    a: 0,
    explain:
      "Evita datos sensibles (DNI, direcciones, contraseñas, salud, etc.).",
  },
  {
    q: "¿Cómo citar el uso de IA en un trabajo escolar?",
    options: [
      "No hace falta decir nada.",
      "Añadir una nota: 'He usado ChatGPT para ideas/esquema/borrador y yo revisé y reescribí'.",
      "Decir que todo es de la IA y yo no hice nada.",
    ],
    a: 1,
    explain:
      "La transparencia es clave: explica cómo la usaste y qué parte es tuya.",
  },
];

const BAD_PROMPTS = [
  {
    id: 1,
    bad: "Explícame historia",
    tip: "Sé concreto: tema, curso/edad, extensión, formato (lista, esquema), ejemplos y tono.",
  },
  {
    id: 2,
    bad: "Haz mi comentario de texto de La casa de Bernarda Alba",
    tip: "Pide guía: estructura, preguntas para reflexionar, vocabulario, y escribe tu versión.",
  },
  {
    id: 3,
    bad: "Dame un trabajo de 10 páginas sobre la fotosíntesis",
    tip: "Divide: índice propuesto + resumen por apartados + fuentes para ampliar.",
  },
];

const RED_FLAGS_SAMPLE = {
  answer:
    "La Revolución de los Pingüinos empezó en 1789 en Francia, cuando los pingüinos derrocaron a Luis XVI. Según el Instituto Francés de Pingüinología, hubo 123 castillos de hielo tomados por asalto. Todo terminó con el Tratado de Hielo de 1795 firmado en la Antártida.",
  checks: [
    { id: "hechos", label: "Hay datos que requieren verificación externa" },
    { id: "inventado", label: "Detecto elementos inventados o absurdos" },
    { id: "fuentes", label: "Faltan fuentes reales o enlaces comprobables" },
    { id: "tono", label: "El tono no es adecuado para un trabajo escolar" },
    { id: "privacidad", label: "Incluye datos personales innecesarios" },
  ],
  correct: ["hechos", "inventado", "fuentes", "tono"],
};

// ----------------------------- Componente Principal -----------------------------
export default function AulaChatGPT() {
  const [tab, setTab] = useState("inicio");
  const [points, setPoints] = useState(0);
  const [streak, setStreak] = useState(0);
  const [badges, setBadges] = useState([]); // ["Constructor/a de Prompts", ...]

  useEffect(() => {
    const saved = loadProgress();
    if (saved) {
      setTab(saved.tab || "inicio");
      setPoints(saved.points || 0);
      setStreak(saved.streak || 0);
      setBadges(saved.badges || []);
    }
  }, []);

  useEffect(() => {
    saveProgress({ tab, points, streak, badges });
  }, [tab, points, streak, badges]);

  function addPoints(n, reason) {
    setPoints((p) => p + n);
    setStreak((s) => s + 1);
    if (reason) toast(reason, n);
  }

  function resetStreak() {
    setStreak(0);
  }

  function unlockBadge(name) {
    setBadges((b) => (b.includes(name) ? b : [...b, name]));
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-indigo-50 text-slate-800">
      <header className="sticky top-0 z-20 backdrop-blur bg-white/70 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Pill icon={Brain} tone="blue">
            Aula ChatGPT
          </Pill>
          <nav className="ml-auto flex gap-2">
            <TopTab
              icon={Sparkles}
              id="builder"
              current={tab}
              setTab={setTab}
              label="Constructor de Prompts"
            />
            <TopTab
              icon={ShieldCheck}
              id="etica"
              current={tab}
              setTab={setTab}
              label="Ética y Seguridad"
            />
            <TopTab
              icon={BookOpen}
              id="verificacion"
              current={tab}
              setTab={setTab}
              label="Verificación"
            />
            <TopTab
              icon={Pencil}
              id="mejora"
              current={tab}
              setTab={setTab}
              label="Redacta Mejor"
            />
            <TopTab
              icon={HelpCircle}
              id="diagnostico"
              current={tab}
              setTab={setTab}
              label="Diagnóstico"
            />
            <TopTab
              icon={Target}
              id="inicio"
              current={tab}
              setTab={setTab}
              label="Inicio"
            />
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 flex flex-col gap-6">
          {tab === "inicio" && <Intro onStart={() => setTab("builder")} />}
          {tab === "builder" && (
            <PromptBuilder
              onScore={(n) => {
                addPoints(n, "+" + n + " puntos por buen prompt");
                unlockBadge("Constructor/a de Prompts");
              }}
            />
          )}
          {tab === "etica" && (
            <EthicsGame
              onScore={(n) => {
                n > 0
                  ? addPoints(n, "+" + n + " puntos en Ética")
                  : resetStreak();
                if (n >= 8) unlockBadge("Guardián/a Ético/a");
              }}
            />
          )}
          {tab === "verificacion" && (
            <VerifyQuiz
              onScore={(n) => {
                addPoints(n, "+" + n + " puntos en Verificación");
                if (n >= 4) unlockBadge("Detective de Fuentes");
              }}
            />
          )}
          {tab === "mejora" && (
            <ImprovePrompt
              onScore={(n) => {
                addPoints(n, "+" + n + " puntos por mejorar");
                if (n >= 2) unlockBadge("Editor/a de Preguntas");
              }}
            />
          )}
          {tab === "diagnostico" && (
            <Diagnosis
              onScore={(ok) => {
                addPoints(
                  ok ? 3 : 0,
                  ok ? "+3 puntos por diagnosticar" : undefined,
                );
                if (ok) unlockBadge("Cazador/a de Fakes");
              }}
            />
          )}
        </section>

        <aside className="lg:col-span-1 flex flex-col gap-6">
          <FancyCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Star className="text-amber-500" /> Progreso
              </h3>
              <Button
                variant="ghost"
                onClick={() => {
                  setPoints(0);
                  setStreak(0);
                  setBadges([]);
                  toast("Progreso reiniciado", 0);
                }}
              >
                {" "}
                <RefreshCw size={16} /> Reiniciar
              </Button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Puntos</span>
                <span className="text-xl font-extrabold">{points}</span>
              </div>
              <ProgressBar value={Math.min(100, points % 100)} />
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Racha</span>
                <span className="font-bold">{streak} ✔️</span>
              </div>
              <div className="pt-2">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Award className="text-purple-600" /> Logros
                </h4>
                {badges.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    Todavía no tienes logros. ¡Explora los módulos!
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {badges.map((b) => (
                      <Pill key={b} tone="purple" icon={Star}>
                        {b}
                      </Pill>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </FancyCard>

          <FancyCard>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Lightbulb className="text-amber-500" /> Consejos Rápidos
            </h3>
            <ul className="list-disc pl-5 text-sm space-y-2 text-slate-700">
              <li>
                Especifica <b>rol</b>, <b>tarea</b>, <b>contexto</b> y{" "}
                <b>formato</b>.
              </li>
              <li>
                Pide <b>pasos</b>, <b>ejemplos</b> y{" "}
                <b>criterios de evaluación</b>.
              </li>
              <li>Evita datos personales; cita el uso de IA si procede.</li>
              <li>Verifica hechos importantes en 2+ fuentes fiables.</li>
              <li>
                Úsalo para <b>aprender</b>, no para hacer trampas.
              </li>
            </ul>
          </FancyCard>

          <FancyCard>
            <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
              <Settings /> Modo Docente
            </h3>
            <p className="text-sm text-slate-700 mb-3">
              Sugerencia de sesión (90 min): 10’ intro + 25’ builder + 20’ ética
              + 15’ verificación + 15’ mejora + 5’ cierre.
            </p>
            <div className="text-sm text-slate-600 space-y-1">
              <p>• Trabajo en parejas, rotación por módulos.</p>
              <p>
                • Reto final: cada pareja crea un <i>prompt</i> excelente y
                explica cómo verificó resultados.
              </p>
              <p>
                • Evaluación: rubricable por claridad, ética y verificación.
              </p>
            </div>
          </FancyCard>
        </aside>
      </main>

      <Footer />

      <Toaster />
    </div>
  );
}

// ----------------------------- Tabs -----------------------------
function TopTab({ id, current, setTab, label, icon: Icon }) {
  const is = current === id;
  return (
    <button
      onClick={() => setTab(id)}
      className={clsx(
        "px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-2",
        is
          ? "bg-blue-600 text-white"
          : "hover:bg-slate-100 text-slate-700 border border-slate-200",
      )}
      aria-pressed={is}
    >
      <Icon size={16} /> {label}
    </button>
  );
}

// ----------------------------- Intro -----------------------------
function Intro({ onStart }) {
  return (
    <FancyCard>
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-blue-50">
          <Brain className="text-blue-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-black leading-tight">
            Aprende a usar ChatGPT{" "}
            <span className="text-blue-600">de forma responsable</span>…
            ¡jugando!
          </h1>
          <p className="mt-2 text-slate-700">
            Explora mini‑juegos y retos para mejorar tus preguntas, decidir
            cuándo es adecuado usar la IA y aprender a verificar lo que te dice.
            Pensado para ESO y Bachillerato.
          </p>
          <div className="mt-4 flex gap-3">
            <Button onClick={onStart} variant="primary">
              <Rocket className="inline mr-2" size={16} /> Empezar ahora
            </Button>
            <Button
              onClick={() =>
                window.scrollTo({
                  top: document.body.scrollHeight,
                  behavior: "smooth",
                })
              }
              variant="ghost"
            >
              <LinkIcon className="inline mr-2" size={16} /> Ver plan docente
            </Button>
          </div>
        </div>
      </div>
    </FancyCard>
  );
}

// ----------------------------- Módulo: Prompt Builder -----------------------------
function PromptBuilder({ onScore }) {
  const [role, setRole] = useState("");
  const [task, setTask] = useState("");
  const [context, setContext] = useState("");
  const [steps, setSteps] = useState(false);
  const [examples, setExamples] = useState(false);
  const [tone, setTone] = useState("neutral");
  const [format, setFormat] = useState("párrafos claros");
  const [limit, setLimit] = useState(200);
  const [lang, setLang] = useState("español");
  const [scored, setScored] = useState(false);

  const preview = useMemo(() => {
    const lines = [];
    if (role) lines.push(`Actúa como ${role}.`);
    if (task) lines.push(`Tu tarea: ${task}.`);
    if (context) lines.push(`Contexto: ${context}.`);
    lines.push(`Formato de salida: ${format}. Tono: ${tone}. Idioma: ${lang}.`);
    if (steps) lines.push("Explica paso a paso.");
    if (examples) lines.push("Incluye 1-2 ejemplos.");
    lines.push(`Límite aproximado: ${limit} palabras.`);
    return lines.join("\n");
  }, [role, task, context, steps, examples, tone, format, limit, lang]);

  function handleScore() {
    // Heurística simple: sumar por campos clave presentes
    let score = 0;
    if (role) score += 1;
    if (task) score += 2;
    if (context) score += 2;
    if (steps) score += 1;
    if (examples) score += 1;
    if (format) score += 1;
    if (tone && tone !== "neutral") score += 1;
    if (limit >= 100) score += 1;
    if (lang) score += 1;
    if (!scored) {
      onScore(score);
      setScored(true);
    }
  }

  return (
    <FancyCard>
      <h2 className="text-xl font-black mb-1 flex items-center gap-2">
        <Sparkles className="text-blue-600" /> Constructor de Prompts
      </h2>
      <p className="text-sm text-slate-600 mb-4">
        Completa los campos para formular una petición clara y útil. ¡Lo que
        escribas abajo será tu <i>prompt</i> final!
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Input
            label="Rol (p. ej., profesor de historia para 4º ESO)"
            value={role}
            setValue={setRole}
            placeholder="Actúa como…"
          />
          <Input
            label="Tarea"
            value={task}
            setValue={setTask}
            placeholder="Explica, resume, corrige, propone…"
          />
          <Textarea
            label="Contexto"
            value={context}
            setValue={setContext}
            placeholder="Qué sabes ya, objetivo, nivel, requisitos…"
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Formato"
              value={format}
              setValue={setFormat}
              options={[
                "párrafos claros",
                "lista con viñetas",
                "esquema",
                "tabla",
              ]}
            />
            <Select
              label="Tono"
              value={tone}
              setValue={setTone}
              options={[
                "neutral",
                "didáctico",
                "entusiasta",
                "formal",
                "ameno",
              ]}
            />
          </div>
          <div className="grid grid-cols-3 gap-3 items-end">
            <Number
              label="Límite (palabras)"
              value={limit}
              setValue={setLimit}
              min={50}
              max={800}
              step={50}
            />
            <Select
              label="Idioma"
              value={lang}
              setValue={setLang}
              options={["español", "valenciano", "inglés"]}
            />
            <div className="flex flex-col gap-2">
              <Toggle
                checked={steps}
                setChecked={setSteps}
                label="Paso a paso"
              />
              <Toggle
                checked={examples}
                setChecked={setExamples}
                label="Con ejemplos"
              />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <label className="text-sm font-semibold text-slate-700">
            Vista previa del prompt
          </label>
          <pre className="whitespace-pre-wrap bg-slate-900 text-slate-100 rounded-xl p-4 text-sm min-h-[220px]">
            {preview}
          </pre>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                navigator.clipboard.writeText(preview);
                toast("Prompt copiado");
              }}
              variant="primary"
            >
              Copiar
            </Button>
            <Button onClick={handleScore} variant="success">
              Evaluar y sumar puntos
            </Button>
          </div>
          <small className="block text-xs text-slate-500">
            Consejo: añade <b>criterios de calidad</b> (por ejemplo, &quot;si
            falta información, haz 3 preguntas primero&quot;).
          </small>
        </div>
      </div>
    </FancyCard>
  );
}

// ----------------------------- Módulo: Ética y Seguridad -----------------------------
function EthicsGame({ onScore }) {
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const [finished, setFinished] = useState(false);

  function answer(val) {
    const sc = ETHICS_SCENARIOS[i];
    const ok = sc.good === val;
    if (ok) setRight((r) => r + 1);
    toast(ok ? "¡Correcto!" : "Ups, piensa en el impacto.");
    const next = i + 1;
    if (next >= ETHICS_SCENARIOS.length) {
      setFinished(true);
      onScore(right + (ok ? 1 : 0));
    } else {
      setI(next);
    }
  }

  function restart() {
    setI(0);
    setRight(0);
    setFinished(false);
  }

  if (finished) {
    return (
      <FancyCard>
        <h2 className="text-xl font-black mb-2 flex items-center gap-2">
          <ShieldCheck className="text-green-600" /> Ética y Seguridad
        </h2>
        <p className="text-slate-700">
          ¡Has acertado {right} de {ETHICS_SCENARIOS.length}! Repasa las
          explicaciones y vuelve a intentarlo si quieres mejorar tu marca.
        </p>
        <div className="mt-4 flex gap-2">
          <Button onClick={restart} variant="primary">
            <RefreshCw size={16} className="inline mr-2" />
            Reintentar
          </Button>
        </div>
        <div className="mt-4 grid md:grid-cols-2 gap-4">
          {ETHICS_SCENARIOS.map((s, idx) => (
            <div key={idx} className="p-3 rounded-xl border border-slate-200">
              <p className="font-medium">{s.text}</p>
              <p
                className={clsx(
                  "mt-1 text-sm",
                  s.good ? "text-green-700" : "text-rose-700",
                )}
              >
                {s.good ? "Adecuado" : "No adecuado"} • {s.why}
              </p>
            </div>
          ))}
        </div>
      </FancyCard>
    );
  }

  const sc = ETHICS_SCENARIOS[i];
  return (
    <FancyCard>
      <h2 className="text-xl font-black mb-2 flex items-center gap-2">
        <ShieldCheck className="text-green-600" /> Ética y Seguridad
      </h2>
      <div className="flex items-center justify-between mb-2">
        <Pill tone="amber" icon={Timer}>
          Pregunta {i + 1} / {ETHICS_SCENARIOS.length}
        </Pill>
        <Pill tone="purple" icon={Star}>
          Aciertos: {right}
        </Pill>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-lg font-medium">
        {sc.text}
      </div>
      <div className="mt-4 flex gap-3">
        <Button onClick={() => answer(true)} variant="success">
          <ThumbsUp className="inline mr-2" size={16} /> Adecuado
        </Button>
        <Button onClick={() => answer(false)} variant="danger">
          <ThumbsDown className="inline mr-2" size={16} /> No adecuado
        </Button>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Pista: piensa en honestidad académica, seguridad, legalidad, privacidad
        e impacto en otras personas.
      </p>
    </FancyCard>
  );
}

// ----------------------------- Módulo: Verificación -----------------------------
function VerifyQuiz({ onScore }) {
  const [answers, setAnswers] = useState(Array(VERIF_QUIZ.length).fill(null));
  const [done, setDone] = useState(false);

  function set(i, v) {
    const copy = [...answers];
    copy[i] = v;
    setAnswers(copy);
  }

  function finish() {
    let score = 0;
    answers.forEach((a, i) => {
      if (a === VERIF_QUIZ[i].a) score++;
    });
    setDone(true);
    onScore(score);
  }

  return (
    <FancyCard>
      <h2 className="text-xl font-black mb-2 flex items-center gap-2">
        <BookOpen className="text-indigo-600" /> Verificación de Fuentes
      </h2>
      <ol className="space-y-4">
        {VERIF_QUIZ.map((q, i) => (
          <li key={i} className="p-3 rounded-xl border border-slate-200">
            <p className="font-semibold mb-2">
              {i + 1}. {q.q}
            </p>
            <div className="grid gap-2">
              {q.options.map((op, j) => (
                <label
                  key={j}
                  className={clsx(
                    "flex items-start gap-2 p-2 rounded-xl border",
                    answers[i] === j
                      ? "border-blue-600 bg-blue-50"
                      : "border-slate-200 hover:bg-slate-50",
                  )}
                >
                  <input
                    type="radio"
                    name={`q${i}`}
                    className="mt-1"
                    checked={answers[i] === j}
                    onChange={() => set(i, j)}
                  />
                  <span className="text-sm">{op}</span>
                </label>
              ))}
            </div>
            {done && (
              <p
                className={clsx(
                  "mt-2 text-sm",
                  answers[i] === q.a ? "text-green-700" : "text-rose-700",
                )}
              >
                {answers[i] === q.a ? "✔️ Correcto" : "✖️ Incorrecto"} —{" "}
                {q.explain}
              </p>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex gap-2">
        {!done ? (
          <Button onClick={finish} variant="primary">
            Corregir
          </Button>
        ) : (
          <Button
            onClick={() => {
              setAnswers(Array(VERIF_QUIZ.length).fill(null));
              setDone(false);
            }}
            variant="ghost"
          >
            <RefreshCw className="inline mr-2" size={16} />
            Reiniciar
          </Button>
        )}
      </div>
    </FancyCard>
  );
}

// ----------------------------- Módulo: Redacta Mejor -----------------------------
function ImprovePrompt({ onScore }) {
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState("");
  const item = BAD_PROMPTS[idx];
  const [checked, setChecked] = useState(false);

  function evaluate() {
    // Heurística: premiar longitud, rol, formato, pasos, contexto
    const t = draft.toLowerCase();
    let score = 0;
    if (draft.length >= 60) score++;
    if (/actúa como|actua como|ponte en el rol/i.test(draft)) score++;
    if (/formato|lista|esquema|tabla|párrafos|parrafos/i.test(t)) score++;
    if (/paso a paso|pregúntame|preguntame|si falta información/i.test(t))
      score++;
    if (/nivel|curso|4º|3º|bachillerato|contexto/i.test(t)) score++;
    onScore(score);
    setChecked(true);
  }

  function next() {
    setIdx((i) => (i + 1) % BAD_PROMPTS.length);
    setDraft("");
    setChecked(false);
  }

  return (
    <FancyCard>
      <h2 className="text-xl font-black mb-2 flex items-center gap-2">
        <Pencil className="text-emerald-600" /> Redacta Mejor
      </h2>
      <p className="text-sm text-slate-600 mb-3">
        Convierte una mala petición en un buen <i>prompt</i>. Usa rol, tarea,
        contexto, tono, formato, límites y pide pasos/preguntas si faltan datos.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-semibold text-slate-700">
            Petición pobre (ejemplo)
          </label>
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900">
            {item.bad}
          </div>
          <p className="mt-2 text-xs text-rose-700">Pista: {item.tip}</p>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">
            Tu versión mejorada
          </label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full min-h-[140px] p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Escribe aquí tu mejor prompt…"
          />
          <div className="mt-2 flex gap-2">
            <Button variant="success" onClick={evaluate}>
              <CheckCircle2 className="inline mr-2" size={16} />
              Evaluar
            </Button>
            <Button variant="ghost" onClick={next}>
              <RefreshCw className="inline mr-2" size={16} />
              Otro reto
            </Button>
          </div>
          {checked && (
            <p className="mt-2 text-sm text-slate-700">
              Puntos otorgados según heurística (longitud, rol, formato, pasos,
              contexto). ¡Sigue practicando!
            </p>
          )}
        </div>
      </div>
    </FancyCard>
  );
}

// ----------------------------- Módulo: Diagnóstico de Respuestas -----------------------------
function Diagnosis({ onScore }) {
  const [selected, setSelected] = useState([]);
  const [checked, setChecked] = useState(false);
  const correctSet = new Set(RED_FLAGS_SAMPLE.correct);

  function toggle(id) {
    setSelected((arr) =>
      arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id],
    );
  }

  function finish() {
    const setSel = new Set(selected);
    let ok = selected.length === RED_FLAGS_SAMPLE.correct.length;
    if (ok) {
      for (const id of selected) if (!correctSet.has(id)) ok = false;
    }
    setChecked(true);
    onScore(ok);
  }

  return (
    <FancyCard>
      <h2 className="text-xl font-black mb-2 flex items-center gap-2">
        <HelpCircle className="text-amber-600" /> Diagnóstico de Respuestas
      </h2>
      <p className="text-sm text-slate-600 mb-3">
        Lee la respuesta y marca las señales de alerta que detectes.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-semibold text-slate-700">
            Respuesta simulada
          </label>
          <div className="p-3 rounded-xl bg-slate-900 text-slate-100 text-sm">
            {RED_FLAGS_SAMPLE.answer}
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">
            Señales de alerta
          </label>
          <div className="grid gap-2">
            {RED_FLAGS_SAMPLE.checks.map((c) => (
              <label
                key={c.id}
                className={clsx(
                  "flex items-start gap-2 p-2 rounded-xl border",
                  selected.includes(c.id)
                    ? "border-blue-600 bg-blue-50"
                    : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(c.id)}
                  onChange={() => toggle(c.id)}
                  className="mt-1"
                />
                <span className="text-sm">{c.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" onClick={finish}>
              Corregir
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSelected([]);
                setChecked(false);
              }}
            >
              <RefreshCw className="inline mr-2" size={16} />
              Reiniciar
            </Button>
          </div>
          {checked && (
            <p className="mt-2 text-sm">
              {selected.sort().join(", ") ===
              RED_FLAGS_SAMPLE.correct.sort().join(", ") ? (
                <span className="text-green-700 font-semibold flex items-center gap-2">
                  <CheckCircle2 /> ¡Bien visto! Esas eran las banderas
                  correctas.
                </span>
              ) : (
                <span className="text-rose-700 font-semibold flex items-center gap-2">
                  <XCircle /> Casi. Pista: hay elementos inventados y falta
                  verificación.
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </FancyCard>
  );
}

// ----------------------------- UI helpers -----------------------------
function Input({ label, value, setValue, placeholder }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <input
        className="rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function Textarea({ label, value, setValue, placeholder }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <textarea
        className="rounded-xl border border-slate-300 px-3 py-2 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-400"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function Select({ label, value, setValue, options }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <select
        className="rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Number({ label, value, setValue, min = 0, max = 1000, step = 10 }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
    </div>
  );
}

function Toggle({ label, checked, setChecked }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
      />{" "}
      {label}
    </label>
  );
}

// ----------------------------- Footer y Toaster -----------------------------
function Footer() {
  return (
    <footer className="border-t border-slate-200 mt-8">
      <div className="max-w-6xl mx-auto px-4 py-6 text-sm text-slate-600 flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-4">
        <span>
          Hecho con <span className="text-rose-600">❤</span> para aprender IA
          responsable.
        </span>
        <span className="opacity-60">
          Consejo: si usas esta app en clase, proyecta y trabajad por parejas.
        </span>
      </div>
    </footer>
  );
}

// Minimalista: toast casero
const listeners = new Set();
function toast(message, delta) {
  listeners.forEach((fn) =>
    fn({ message, delta, id: Math.random().toString(36).slice(2) }),
  );
}
function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    function onToast(t) {
      setItems((arr) => [...arr, t]);
      setTimeout(() => {
        setItems((arr) => arr.filter((x) => x.id !== t.id));
      }, 1800);
    }
    listeners.add(onToast);
    return () => listeners.delete(onToast);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {items.map((t) => (
        <div
          key={t.id}
          className={clsx(
            "px-4 py-2 rounded-xl shadow-lg border text-sm",
            t.delta > 0
              ? "bg-emerald-600 text-white border-emerald-700"
              : "bg-slate-900 text-white border-slate-800",
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
