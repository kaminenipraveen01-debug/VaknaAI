"use client";
import { useState, useEffect } from "react";
import styles from "./WorldClock.module.css";

// All world zones grouped by region
const ALL_ZONES = [
  { city: "Mumbai", country: "India", tz: "Asia/Kolkata", flag: "🇮🇳", offset: 5.5 },
  { city: "Dubai", country: "UAE", tz: "Asia/Dubai", flag: "🇦🇪", offset: 4 },
  { city: "London", country: "UK", tz: "Europe/London", flag: "🇬🇧", offset: 0 },
  { city: "Paris", country: "France", tz: "Europe/Paris", flag: "🇫🇷", offset: 1 },
  { city: "New York", country: "USA", tz: "America/New_York", flag: "🇺🇸", offset: -5 },
  { city: "Los Angeles", country: "USA", tz: "America/Los_Angeles", flag: "🇺🇸", offset: -8 },
  { city: "Toronto", country: "Canada", tz: "America/Toronto", flag: "🇨🇦", offset: -5 },
  { city: "Singapore", country: "Singapore", tz: "Asia/Singapore", flag: "🇸🇬", offset: 8 },
  { city: "Tokyo", country: "Japan", tz: "Asia/Tokyo", flag: "🇯🇵", offset: 9 },
  { city: "Sydney", country: "Australia", tz: "Australia/Sydney", flag: "🇦🇺", offset: 10 },
  { city: "Karachi", country: "Pakistan", tz: "Asia/Karachi", flag: "🇵🇰", offset: 5 },
  { city: "Dhaka", country: "Bangladesh", tz: "Asia/Dhaka", flag: "🇧🇩", offset: 6 },
  { city: "Riyadh", country: "Saudi Arabia", tz: "Asia/Riyadh", flag: "🇸🇦", offset: 3 },
  { city: "Moscow", country: "Russia", tz: "Europe/Moscow", flag: "🇷🇺", offset: 3 },
  { city: "Beijing", country: "China", tz: "Asia/Shanghai", flag: "🇨🇳", offset: 8 },
  { city: "Berlin", country: "Germany", tz: "Europe/Berlin", flag: "🇩🇪", offset: 1 },
  { city: "São Paulo", country: "Brazil", tz: "America/Sao_Paulo", flag: "🇧🇷", offset: -3 },
  { city: "Lagos", country: "Nigeria", tz: "Africa/Lagos", flag: "🇳🇬", offset: 1 },
  { city: "Nairobi", country: "Kenya", tz: "Africa/Nairobi", flag: "🇰🇪", offset: 3 },
  { city: "Colombo", country: "Sri Lanka", tz: "Asia/Colombo", flag: "🇱🇰", offset: 5.5 },
  { city: "Jakarta", country: "Indonesia", tz: "Asia/Jakarta", flag: "🇮🇩", offset: 7 },
  { city: "Bali", country: "Indonesia", tz: "Asia/Makassar", flag: "🇮🇩", offset: 8 },
  { city: "Kuala Lumpur", country: "Malaysia", tz: "Asia/Kuala_Lumpur", flag: "🇲🇾", offset: 8 },
  { city: "Bangkok", country: "Thailand", tz: "Asia/Bangkok", flag: "🇹🇭", offset: 7 },
  { city: "Manila", country: "Philippines", tz: "Asia/Manila", flag: "🇵🇭", offset: 8 },
];

function fmt(tz: string, type: "time" | "date") {
  const opts: Intl.DateTimeFormatOptions = type === "time"
    ? { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true }
    : { timeZone: tz, weekday: "short", month: "short", day: "numeric" };
  return new Intl.DateTimeFormat("en-US", opts).format(new Date());
}

function ClockFace({ tz, size = 44 }: { tz: string; size?: number }) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
  }).formatToParts(now);
  const h = parseInt(parts.find(p => p.type === "hour")?.value || "0") % 12;
  const m = parseInt(parts.find(p => p.type === "minute")?.value || "0");
  const s = parseInt(parts.find(p => p.type === "second")?.value || "0");
  const cx = size / 2, cy = size / 2, r = size / 2 - 2;
  const hand = (deg: number, len: number) => ({
    x2: cx + len * Math.cos((deg - 90) * Math.PI / 180),
    y2: cy + len * Math.sin((deg - 90) * Math.PI / 180),
  });
  const hh = hand(h * 30 + m * 0.5, r * 0.5);
  const mh = hand(m * 6, r * 0.72);
  const sh = hand(s * 6, r * 0.82);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} stroke="#6366f1" strokeWidth="1.2" fill="none" opacity="0.35" />
      {[0,30,60,90,120,150,180,210,240,270,300,330].map(d => {
        const rad = (d - 90) * Math.PI / 180;
        return <line key={d} x1={cx + (r-4)*Math.cos(rad)} y1={cy + (r-4)*Math.sin(rad)}
          x2={cx + r*Math.cos(rad)} y2={cy + r*Math.sin(rad)} stroke="#6366f1" strokeWidth="1" opacity="0.4" />;
      })}
      <line x1={cx} y1={cy} x2={hh.x2} y2={hh.y2} stroke="#f0f0f8" strokeWidth="2.2" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={mh.x2} y2={mh.y2} stroke="#818cf8" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={sh.x2} y2={sh.y2} stroke="#ec4899" strokeWidth="1" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="2.2" fill="#6366f1" />
    </svg>
  );
}

export default function WorldClock() {
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [userTz, setUserTz] = useState("Asia/Kolkata");
  const [userZone, setUserZone] = useState(ALL_ZONES[0]);

  useEffect(() => {
    // Detect user's timezone
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setUserTz(detected);
    const match = ALL_ZONES.find(z => z.tz === detected) || ALL_ZONES[0];
    setUserZone(match);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Filter zones by search
  const filtered = search.trim()
    ? ALL_ZONES.filter(z =>
        z.city.toLowerCase().includes(search.toLowerCase()) ||
        z.country.toLowerCase().includes(search.toLowerCase())
      )
    : ALL_ZONES;

  return (
    <div className={styles.wrap}>
      <button className={styles.primary} onClick={() => setOpen(p => !p)}>
        <ClockFace tz={userTz} size={40} />
        <div className={styles.info}>
          <span className={styles.time}>{fmt(userTz, "time")}</span>
          <span className={styles.date}>{userZone.flag} {userZone.city}</span>
        </div>
        <span className={styles.chevron}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className={styles.dropdown}>
          <input
            className={styles.searchInput}
            placeholder="🔍 Search city or country..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
          <div className={styles.zoneList}>
            {filtered.map(z => (
              <div key={z.tz} className={`${styles.zone} ${z.tz === userTz ? styles.zoneActive : ""}`}>
                <span className={styles.flag}>{z.flag}</span>
                <div className={styles.zoneInfo}>
                  <span className={styles.city}>{z.city}</span>
                  <span className={styles.country}>{z.country}</span>
                </div>
                <div className={styles.zoneRight}>
                  <span className={styles.zoneTime}>{fmt(z.tz, "time")}</span>
                  <span className={styles.zoneDate}>{fmt(z.tz, "date")}</span>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className={styles.noResult}>No results for "{search}"</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}