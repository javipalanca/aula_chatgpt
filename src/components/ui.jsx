import React from 'react'
import { Star } from 'lucide-react'

export function clsx(...classes) { return classes.filter(Boolean).join(' ') }

export function FancyCard({ children, className }) {
  return (
    <div className={clsx(
      'rounded-2xl shadow-lg bg-white/80 backdrop-blur border border-slate-200',
      'p-5 md:p-6',
      className
    )}>{children}</div>
  )
}

export function Pill({ children, icon: Icon, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-green-100 text-green-700',
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    purple: 'bg-purple-100 text-purple-700',
    red: 'bg-rose-100 text-rose-700',
  }
  return (
    <span className={clsx('inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium', tones[tone])}>
      {Icon && <Icon size={16}/>} {children}
    </span>
  )
}

export function Button({ children, onClick, variant = 'primary', className, type = 'button', disabled }) {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-700 border border-slate-200',
    success: 'bg-green-600 hover:bg-green-700 text-white',
    danger: 'bg-rose-600 hover:bg-rose-700 text-white',
  }
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={clsx('px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition focus:outline-none', disabled ? 'opacity-50 cursor-not-allowed' : variants[variant], className)}>
      {children}
    </button>
  )
}

export function ProgressBar({ value }) {
  return (
    <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
      <div className="h-full bg-blue-600 transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

export function Toggle({ label, checked, setChecked }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e)=>setChecked(e.target.checked)} /> {label}
    </label>
  )
}

export function Input({ label, value, setValue, placeholder }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <input className="rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" value={value} onChange={(e)=>setValue(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

export function Textarea({ label, value, setValue, placeholder }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <textarea className="rounded-xl border border-slate-300 px-3 py-2 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-400" value={value} onChange={(e)=>setValue(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

export function Select({ label, value, setValue, options }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <select className="rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" value={value} onChange={(e)=>setValue(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

export function Number({ label, value, setValue, min=0, max=1000, step=10 }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <input type="number" min={min} max={max} step={step} value={value} onChange={(e)=>setValue(Number(e.target.value))} className="rounded-xl border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"/>
    </div>
  )
}
