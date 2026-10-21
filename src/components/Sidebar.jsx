import { Activity, ChartNoAxesCombined, ClipboardList, ShieldCheck, Settings2 } from "lucide-react";
export default function Sidebar() {
  return <aside className="desktop-only fixed left-0 top-0 flex h-screen w-[230px] flex-col border-r border-[#26354c] bg-[#0a1322] px-5 py-6">
    <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600"><Activity size={22}/></div><div><div className="text-xl font-black tracking-[.18em]">NSB</div><div className="text-[10px] tracking-[.16em] text-slate-400">SMART BROKER</div></div></div>
    <div className="mt-10 space-y-2"><div className="rounded-xl border border-blue-400/20 bg-blue-500/10 px-3 py-3 text-sm text-blue-200"><ChartNoAxesCombined className="mr-3 inline" size={17}/>Market analysis</div><div className="px-3 py-3 text-sm text-slate-400"><ClipboardList className="mr-3 inline" size={17}/>Paper trading</div><div className="px-3 py-3 text-sm text-slate-400"><ShieldCheck className="mr-3 inline" size={17}/>Risk controls</div><div className="px-3 py-3 text-sm text-slate-400"><Settings2 className="mr-3 inline" size={17}/>Data settings</div></div>
    <div className="mt-auto rounded-xl border border-[#26354c] bg-[#101b2d] p-3"><div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400"/>Paper mode enabled</div><p className="text-xs leading-5 text-slate-400">No real orders are sent to a broker. Trades are stored in this browser.</p></div>
  </aside>;
}
