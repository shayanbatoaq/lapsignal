"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, Gamepad2, Radio, RotateCcw, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const steps = [
  { key: "experience_level", title: "Where are you starting from?", copy: "LapSignal adjusts the density and language of coaching—not the evidence standard.", options: [["beginner","Learning the foundations"],["intermediate","Building consistency"],["advanced","Refining technique"]] },
  { key: "input_device", title: "What do you drive with?", copy: "Controller and wheel inputs are evaluated with different smoothing expectations.", options: [["controller","Controller"],["wheel","Wheel and pedals"],["unknown","Decide later"]] },
  { key: "primary_interest", title: "What do you want to develop?", copy: "This sets your default context while keeping every demo session available.", options: [["f1","F1-style racing"],["gt3","GT3"],["endurance","Hypercars and endurance"],["mixed","A mixed programme"]] },
  { key: "coaching_goal", title: "Choose the first coaching goal.", copy: "We will prioritize the clearest supported action—not force a finding where data is weak.", options: [["pace","Pace"],["consistency","Consistency"],["racecraft","Racecraft"],["tyre_management","Tyre management"],["learning","Learning"]] }
] as const;

type Profile = { experience_level: string; input_device: string; primary_interest: string; coaching_goal: string };

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>({ experience_level: "intermediate", input_device: "controller", primary_interest: "mixed", coaching_goal: "consistency" });
  useEffect(() => { const saved = localStorage.getItem("lapsignal-profile"); if (saved) setProfile(JSON.parse(saved)); }, []);
  const finish = () => { localStorage.setItem("lapsignal-profile", JSON.stringify(profile)); localStorage.setItem("lapsignal-onboarded", "true"); router.push("/app"); };
  const select = (key: keyof Profile, value: string) => setProfile((current) => ({ ...current, [key]: value }));
  const content = steps[step];
  return <div className="onboarding"><div className="onboarding-progress" aria-label={`Step ${step+1} of 6`}>{Array.from({length:6},(_,index)=><span className={index<=step?"active":""} key={index}/>)}</div><section className="onboarding-card">
    {content && <><p className="eyebrow">Profile · step {step+1}</p><h2>{content.title}</h2><p>{content.copy}</p><div className="choice-grid">{content.options.map(([value,label])=><button className={`choice ${profile[content.key]===value?"selected":""}`} aria-pressed={profile[content.key]===value} onClick={()=>select(content.key,value)} key={value}>{content.key==="input_device"&&<Gamepad2 size={20}/>}<strong>{label}</strong><span>{profile[content.key]===value?"Selected":"Choose this context"}</span></button>)}</div></>}
    {step===4 && <><p className="eyebrow">Operating modes · step 5</p><h2>Use LapSignal your way.</h2><p>Every mode stays functional without paid services or cloud credentials.</p><div className="choice-grid"><div className="choice selected"><CheckCircle2 size={20}/><strong>Demo</strong><span>Three deterministic seeded sessions.</span></div><div className="choice"><RotateCcw size={20}/><strong>Replay</strong><span>Animate the live page through real ingestion.</span></div><div className="choice"><Radio size={20}/><strong>Live</strong><span>Native Windows UDP listener on port 20777.</span></div></div></>}
    {step===5 && <><p className="eyebrow">F1 2021 on PS4 · step 6</p><h2>Point the console at this laptop.</h2><p>Keep the PS4 and laptop on the same local network. Run the collector in Windows, find the laptop IPv4 address with <span className="mono">ipconfig</span>, then use these in-game Telemetry Settings.</p><div className="surface-card"><div className="technical-list"><div className="technical-row"><span>UDP Telemetry</span><strong>On</strong></div><div className="technical-row"><span>UDP Broadcast Mode</span><strong>Off</strong></div><div className="technical-row"><span>UDP IP Address</span><strong>Laptop IPv4</strong></div><div className="technical-row"><span>UDP Port</span><strong>20777</strong></div><div className="technical-row"><span>UDP Send Rate</span><strong>20Hz</strong></div><div className="technical-row"><span>UDP Format</span><strong>2021</strong></div></div></div><div className="state-card" style={{marginTop:14}}><Wifi size={20}/><div><strong>First connection check</strong><p>Windows Firewall may need an inbound UDP 20777 rule. Avoid WSL for live collection.</p></div></div></>}
    <div className="onboarding-actions"><button className="button ghost" onClick={()=>setStep(Math.max(0,step-1))} disabled={step===0}><ArrowLeft size={16}/> Back</button>{step<5?<button className="button" onClick={()=>setStep(step+1)}>Continue <ArrowRight size={16}/></button>:<button className="button" onClick={finish}>Open LapSignal <ArrowRight size={16}/></button>}</div>
  </section></div>;
}
