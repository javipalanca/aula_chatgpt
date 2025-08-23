import React, { useEffect, useState } from 'react'
import { clsx } from './ui'

const listeners = new Set();
export function toast(message, delta) { listeners.forEach((fn)=>fn({ message, delta, id: Math.random().toString(36).slice(2) })); }

export default function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(()=>{
    function onToast(t) { setItems((arr)=>[...arr,t]); setTimeout(()=> setItems((arr)=>arr.filter(x=>x.id!==t.id)), 1800); }
    listeners.add(onToast); return ()=> listeners.delete(onToast);
  },[])

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
      {items.map((t)=> (
        <div key={t.id} className={clsx('px-4 py-2 rounded-xl shadow-lg border text-sm', t.delta>0? 'bg-emerald-600 text-white border-emerald-700' : 'bg-slate-900 text-white border-slate-800')}>{t.message}</div>
      ))}
    </div>
  )
}
