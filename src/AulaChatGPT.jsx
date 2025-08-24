import React, { useEffect, useState } from 'react'
import { Brain, Sparkles, ShieldCheck, BookOpen, Pencil, HelpCircle, Target, Star, RefreshCw, Settings, Lightbulb, Award, Rocket, Link as LinkIcon, Eye, EyeOff } from 'lucide-react'
import { loadProgress, saveProgress } from './lib/storage'
import { FancyCard, Pill, Button, ProgressBar, clsx } from './components/ui'
import PromptBuilder from './modules/PromptBuilder'
import EthicsGame from './modules/EthicsGame'
import VerifyQuiz from './modules/VerifyQuiz'
import ImprovePrompt from './modules/ImprovePrompt'
import Diagnosis from './modules/Diagnosis'
import Footer from './components/Footer'
import Toaster, { toast } from './components/Toaster'
import MascotGuide, { mascotSpeak, setMascotSettings } from './components/MascotGuide'
import { loadSettings, saveSettings } from './lib/storage'

export default function AulaChatGPT() {
  const [tab, setTab] = useState('inicio')
  // announce tab changes to the mascot
  useEffect(() => {
    mascotSpeak({ text: `Has cambiado a ${tab}`, mood: 'neutral', duration: 2000 })
    try { window.dispatchEvent(new CustomEvent('mascot-bounce')) } catch {}
  }, [tab])
  const [points, setPoints] = useState(0)
  const [streak, setStreak] = useState(0)
  const [badges, setBadges] = useState([])

  useEffect(()=>{
    const saved = loadProgress()
    if (saved) {
      setTab(saved.tab || 'inicio')
      setPoints(saved.points || 0)
      setStreak(saved.streak || 0)
      setBadges(saved.badges || [])
    }
  },[])

  useEffect(()=> saveProgress({ tab, points, streak, badges }), [tab, points, streak, badges])

  const [appSettings, setAppSettings] = useState(loadSettings())

  useEffect(()=> saveSettings(appSettings), [appSettings])
  useEffect(()=> setMascotSettings(appSettings), [appSettings])

  function addPoints(n, reason) { setPoints(p=>p+n); setStreak(s=>s+1); if (reason) toast(reason, n); mascotSpeak({ text: reason || `Has ganado ${n} puntos`, mood: 'happy' }) }
  function resetStreak(){ setStreak(0); mascotSpeak({ text: 'Racha finalizada. Sigue intentándolo.', mood: 'sad' }) }
  function unlockBadge(name){ setBadges(b=> b.includes(name)? b: [...b, name]); mascotSpeak({ text: `¡Has conseguido el logro ${name}!`, mood: 'cheer' }) }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-indigo-50 text-slate-800">
      <header className="sticky top-0 z-20 backdrop-blur bg-white/70 border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Pill icon={Brain} tone="blue">Aula ChatGPT</Pill>
          <nav className="ml-auto flex gap-2 items-center">
            <TopTab icon={Sparkles} id="builder" current={tab} setTab={setTab} label="Constructor de Prompts" />
            <TopTab icon={ShieldCheck} id="etica" current={tab} setTab={setTab} label="Ética y Seguridad" />
            <TopTab icon={BookOpen} id="verificacion" current={tab} setTab={setTab} label="Verificación" />
            <TopTab icon={Pencil} id="mejora" current={tab} setTab={setTab} label="Redacta Mejor" />
            <TopTab icon={HelpCircle} id="diagnostico" current={tab} setTab={setTab} label="Diagnóstico" />
            <TopTab icon={Target} id="inicio" current={tab} setTab={setTab} label="Inicio" />
            {/* Global mascot toggle */}
            <button title={appSettings.mascotVisible? 'Ocultar mascota' : 'Mostrar mascota'} onClick={() => setAppSettings(s => ({ ...s, mascotVisible: !s.mascotVisible }))} className="ml-2 p-2 rounded-lg hover:bg-slate-100">
              {appSettings.mascotVisible ? <Eye size={16}/> : <EyeOff size={16}/>} 
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 flex flex-col gap-6">
          {tab === 'inicio' && <Intro onStart={() => setTab('builder')} />}
          {tab === 'builder' && <PromptBuilder onScore={(n)=>{ addPoints(n, `+${n} puntos por buen prompt`); unlockBadge('Constructor/a de Prompts') }} />}
          {tab === 'etica' && <EthicsGame onScore={(n)=>{ n>0? addPoints(n, `+${n} puntos en Ética`) : resetStreak(); if (n>=8) unlockBadge('Guardián/a Ético/a') }} />}
          {tab === 'verificacion' && <VerifyQuiz onScore={(n)=>{ addPoints(n, `+${n} puntos en Verificación`); if (n>=4) unlockBadge('Detective de Fuentes') }} />}
          {tab === 'mejora' && <ImprovePrompt onScore={(n)=>{ addPoints(n, `+${n} puntos por mejorar`); if (n>=2) unlockBadge('Editor/a de Preguntas') }} />}
          {tab === 'diagnostico' && <Diagnosis onScore={(ok)=>{ addPoints(ok?3:0, ok?'+3 puntos por diagnosticar':undefined); if (ok) unlockBadge('Cazador/a de Fakes') }} />}
        </section>

        <aside className="lg:col-span-1 flex flex-col gap-6">
          <FancyCard>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2"><Star className="text-amber-500"/> Progreso</h3>
              <Button variant="ghost" onClick={() => { setPoints(0); setStreak(0); setBadges([]); toast('Progreso reiniciado', 0); }}> <RefreshCw size={16}/> Reiniciar</Button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Puntos</span>
                <span className="text-xl font-extrabold">{points}</span>
              </div>
              <ProgressBar value={Math.min(100, (points % 100))} />
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Racha</span>
                <span className="font-bold">{streak} ✔️</span>
              </div>
              <div className="pt-2">
                <h4 className="font-semibold mb-2 flex items-center gap-2"><Award className="text-purple-600"/> Logros</h4>
                {badges.length===0 ? (
                  <p className="text-sm text-slate-600">Todavía no tienes logros. ¡Explora los módulos!</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {badges.map((b) => (
                      <Pill key={b} tone="purple" icon={Star}>{b}</Pill>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </FancyCard>

          <FancyCard>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2"><Lightbulb className="text-amber-500"/> Consejos Rápidos</h3>
            <ul className="list-disc pl-5 text-sm space-y-2 text-slate-700">
              <li>Especifica <b>rol</b>, <b>tarea</b>, <b>contexto</b> y <b>formato</b>.</li>
              <li>Pide <b>pasos</b>, <b>ejemplos</b> y <b>criterios de evaluación</b>.</li>
              <li>Evita datos personales; cita el uso de IA si procede.</li>
              <li>Verifica hechos importantes en 2+ fuentes fiables.</li>
              <li>Úsalo para <b>aprender</b>, no para hacer trampas.</li>
            </ul>
          </FancyCard>

          <FancyCard>
            <h3 className="text-lg font-bold mb-2 flex items-center gap-2"><Settings/> Modo Docente</h3>
            <p className="text-sm text-slate-700 mb-3">Sugerencia de sesión (90 min): 10’ intro + 25’ builder + 20’ ética + 15’ verificación + 15’ mejora + 5’ cierre.</p>
            <div className="text-sm text-slate-600 space-y-1">
              <p>• Trabajo en parejas, rotación por módulos.</p>
              <p>• Reto final: cada pareja crea un <i>prompt</i> excelente y explica cómo verificó resultados.</p>
              <p>• Evaluación: rubricable por claridad, ética y verificación.</p>
            </div>
          </FancyCard>

          <FancyCard>
            <h3 className="text-lg font-bold mb-2 flex items-center gap-2"><Settings/> Avatar</h3>
            <div className="text-sm text-slate-700 space-y-2">
              <label className="flex items-center gap-2"><input type="checkbox" checked={appSettings.mascotVisible} onChange={e => setAppSettings(s => ({ ...s, mascotVisible: e.target.checked }))} /> Mostrar mascota</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={appSettings.mascotMuted} onChange={e => setAppSettings(s => ({ ...s, mascotMuted: e.target.checked }))} /> Silenciar mensajes</label>
            </div>
          </FancyCard>
        </aside>
      </main>

  <Footer />
  <Toaster />
  <MascotGuide />
    </div>
  )
}

function TopTab({ id, current, setTab, label, icon: Icon }) {
  const is = current === id
  return (
    <button onClick={() => setTab(id)} className={clsx('px-3 py-2 rounded-xl text-sm font-semibold flex items-center gap-2', is ? 'bg-blue-600 text-white' : 'hover:bg-slate-100 text-slate-700 border border-slate-200')} aria-pressed={is}>
      <Icon size={16} /> {label}
    </button>
  )
}

function Intro({ onStart }) {
  return (
    <FancyCard>
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-2xl bg-blue-50"><Brain className="text-blue-600"/></div>
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-black leading-tight">Aprende a usar ChatGPT <span className="text-blue-600">de forma responsable</span>… ¡jugando!</h1>
          <p className="mt-2 text-slate-700">Explora mini‑juegos y retos para mejorar tus preguntas, decidir cuándo es adecuado usar la IA y aprender a verificar lo que te dice. Pensado para ESO y Bachillerato.</p>
          <div className="mt-4 flex gap-3">
            <Button onClick={onStart} variant="primary"><Rocket className="inline mr-2" size={16}/> Empezar ahora</Button>
            <Button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })} variant="ghost"><LinkIcon className="inline mr-2" size={16}/> Ver plan docente</Button>
          </div>
        </div>
      </div>
    </FancyCard>
  )
}
