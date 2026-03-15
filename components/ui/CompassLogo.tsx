"use client";
interface Props { size?: number; spinning?: boolean; pulsing?: boolean; }
export default function CompassLogo({ size = 32, spinning = false, pulsing = false }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="20" r="18" stroke="#6366f1" strokeWidth="1.5" opacity="0.4"
        style={spinning ? { transformOrigin:"20px 20px", animation:"spin 8s linear infinite" } : {}} />
      <circle cx="20" cy="20" r="14" stroke="#818cf8" strokeWidth="1" opacity="0.3" />
      <line x1="20" y1="4" x2="20" y2="8" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20" y1="32" x2="20" y2="36" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="4" y1="20" x2="8" y2="20" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="32" y1="20" x2="36" y2="20" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" />
      <polygon points="20,8 22,20 20,22 18,20" fill="#818cf8"
        style={pulsing ? { transformOrigin:"20px 20px", animation:"needlePulse 1s ease-in-out infinite" } : {}} />
      <polygon points="20,32 22,20 20,18 18,20" fill="#ec4899" opacity="0.8" />
      <circle cx="20" cy="20" r="2.5" fill="#6366f1" />
    </svg>
  );
}
