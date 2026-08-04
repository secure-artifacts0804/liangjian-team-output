"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Panel = "people" | "checkin" | "drive" | "permissions";
type Slot = "noon" | "afternoon" | "evening";
type Category = {
  name: string;
  monthly: number;
  daily: number;
  countMode?: "file" | "duration";
  unitSeconds?: number;
};
type Person = {
  id: string;
  name: string;
  role: string;
  team: string;
  accent: string;
  categories: Category[];
  status?: "active" | "archived";
  archivedAt?: string;
  isLeader?: boolean;
};
type SecretHash = {
  salt: string;
  hash: string;
};
type AuthConfig = {
  version: 1;
  staff: SecretHash;
  admin: SecretHash;
  leaderPins: Record<string, SecretHash>;
};
type AccessSession =
  | { kind: "employee"; personId: string }
  | { kind: "leader"; personId: string }
  | { kind: "admin" };
type SecretInputProps = {
  name?: string;
  value?: string;
  placeholder?: string;
  minLength?: number;
  required?: boolean;
  inputMode?: "text" | "numeric";
  autoComplete?: string;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};
type Checkins = Record<string, Record<string, Partial<Record<Slot, number>>>>;
type DailyQuotas = Record<string, Record<string, Category[]>>;
type VideoDetail = {
  name: string;
  durationSeconds: number | null;
};
type DriveRecord = {
  id: string;
  personId: string;
  date: string;
  url: string;
  folderId?: string;
  folderName: string;
  images: number;
  videos: number;
  selected: number;
  selectedFolders?: number;
  videoDurationSeconds?: number;
  videoDurationUnavailable?: number;
  videoDetails?: VideoDetail[];
  videoDetailsTruncated?: boolean;
  categoryName?: string;
  countedUnits?: number;
  countMode?: "file" | "duration";
  unitSeconds?: number;
};

const colors = ["#E98B68", "#D9A04B", "#D97867", "#C78B72", "#E3B55D"];
const driveFolderPattern =
  /^https:\/\/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?folders\/|open\?id=)([-\w]{10,})/i;
const slots: { key: Slot; label: string }[] = [
  { key: "noon", label: "中午" },
  { key: "afternoon", label: "下午" },
  { key: "evening", label: "晚上" },
];

const initialPeople: Person[] = [
  {
    id: "p1",
    name: "张晓雨",
    role: "AI 视觉",
    team: "AI组",
    accent: colors[0],
    categories: [
      { name: "AI图", monthly: 120, daily: 6 },
      { name: "AI图批量", monthly: 80, daily: 4 },
    ],
  },
  {
    id: "p2",
    name: "李明",
    role: "口播制作",
    team: "口播组",
    accent: colors[1],
    categories: [
      { name: "口播", monthly: 90, daily: 5 },
      {
        name: "Flow口播",
        monthly: 60,
        daily: 3,
        countMode: "duration",
        unitSeconds: 30,
      },
    ],
  },
  {
    id: "p3",
    name: "王佳",
    role: "内容制作",
    team: "内容组",
    accent: colors[2],
    categories: [
      { name: "AI图", monthly: 100, daily: 5 },
      { name: "口播", monthly: 80, daily: 4 },
    ],
  },
  {
    id: "p4",
    name: "陈晨",
    role: "批量制作",
    team: "AI组",
    accent: colors[3],
    categories: [{ name: "AI图批量", monthly: 160, daily: 8 }],
  },
];

const today = new Date();
const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const todayKey = toDateKey(today);

function latestDates(count = 7) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    return {
      key: toDateKey(date),
      label:
        index === 0
          ? "今天"
          : `${date.getMonth() + 1}月${date.getDate()}日`,
    };
  });
}

const seedCheckins: Checkins = {
  [todayKey]: {
    p1: { noon: 3, afternoon: 4, evening: 4 },
    p2: { noon: 2, afternoon: 3, evening: 2 },
    p3: { noon: 3, afternoon: 2 },
    p4: { noon: 3, afternoon: 3, evening: 2 },
  },
};

const seedRecords: DriveRecord[] = [
  {
    id: "d1",
    personId: "p1",
    date: todayKey,
    url: "https://drive.google.com/drive/folders/example-1",
    folderName: "张晓雨 · 今日第1批",
    images: 68,
    videos: 0,
    selected: 49,
    categoryName: "AI图",
    countedUnits: 68,
  },
  {
    id: "d2",
    personId: "p1",
    date: todayKey,
    url: "https://drive.google.com/drive/folders/example-2",
    folderName: "张晓雨 · 今日第2批",
    images: 24,
    videos: 0,
    selected: 18,
    categoryName: "AI图",
    countedUnits: 24,
  },
  {
    id: "d3",
    personId: "p2",
    date: todayKey,
    url: "https://drive.google.com/drive/folders/example-3",
    folderName: "李明 · 口播成片",
    images: 0,
    videos: 9,
    selected: 7,
    categoryName: "Flow口播",
    countedUnits: 9,
    countMode: "duration",
    unitSeconds: 30,
  },
  {
    id: "d4",
    personId: "p3",
    date: todayKey,
    url: "https://drive.google.com/drive/folders/example-4",
    folderName: "王佳 · 今日素材",
    images: 41,
    videos: 3,
    selected: 31,
    categoryName: "AI图",
    countedUnits: 44,
  },
];

function safeLoad<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function SecretInput({
  name,
  value,
  placeholder,
  minLength,
  required,
  inputMode,
  autoComplete,
  onChange,
}: SecretInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="secret-input">
      <input
        name={name}
        type={visible ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        minLength={minLength}
        required={required}
        inputMode={inputMode}
        autoComplete={autoComplete}
        onChange={onChange}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? "隐藏输入内容" : "显示输入内容"}
        aria-pressed={visible}
      >
        {visible ? "隐藏" : "显示"}
      </button>
    </span>
  );
}

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function hashSecret(secret: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: salt.startsWith("v2:") ? 100_000 : 120_000,
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(bits), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function createSecretHash(secret: string): Promise<SecretHash> {
  const salt = `v2:${randomSalt()}`;
  return { salt, hash: await hashSecret(secret, salt) };
}

type LoginResult = {
  role?: AccessSession["kind"];
  error?: string;
  code?: string;
  passwordSalt?: string;
  leaderPinSalt?: string;
};

async function requestLogin(
  payload: Record<string, string>,
  password: string,
  leaderPin = "",
) {
  async function send(body: Record<string, string>) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({
      error: "登录服务暂时不可用，请稍后重试",
    }))) as LoginResult;
    return { response, result };
  }

  let attempt = await send(payload);
  if (
    attempt.response.status === 409 &&
    attempt.result.code === "PASSWORD_UPGRADE_REQUIRED"
  ) {
    const upgradedPayload = { ...payload };
    if (attempt.result.passwordSalt) {
      upgradedPayload.passwordProof = await hashSecret(
        password,
        attempt.result.passwordSalt,
      );
    }
    if (attempt.result.leaderPinSalt && leaderPin) {
      upgradedPayload.leaderPinProof = await hashSecret(
        leaderPin,
        attempt.result.leaderPinSalt,
      );
    }
    attempt = await send(upgradedPayload);
  }
  return attempt;
}

async function verifySecret(secret: string, saved?: SecretHash) {
  if (!saved) return false;
  return (await hashSecret(secret, saved.salt)) === saved.hash;
}

function initials(name: string) {
  return name.slice(-2);
}

function monthlyQuota(person: Person) {
  return person.categories.reduce((sum, item) => sum + item.monthly, 0);
}

function driveTotal(record: DriveRecord) {
  return record.images + record.videos;
}

function extractDriveFolderId(url: string) {
  return url.match(driveFolderPattern)?.[1] ?? "";
}

function formatSeconds(seconds: number) {
  return `${Math.max(0, Math.round(seconds))}s`;
}

function normalizeCategory(category: Category): Category {
  const durationByName = category.name.toLowerCase().includes("flow");
  const countMode =
    category.countMode === "duration" || category.countMode === "file"
      ? category.countMode
      : durationByName
        ? "duration"
        : "file";
  return {
    ...category,
    countMode,
    unitSeconds:
      countMode === "duration"
        ? Math.max(1, Number(category.unitSeconds) || 30)
        : undefined,
  };
}

function countRuleLabel(category: Category) {
  const normalized = normalizeCategory(category);
  return normalized.countMode === "duration"
    ? `每${normalized.unitSeconds}秒计1 · 四舍五入`
    : "每个文件计1";
}

function recordUnits(record: DriveRecord) {
  return Math.max(
    0,
    Number(record.countedUnits ?? driveTotal(record)) || 0,
  );
}

function calculateCountedUnits(
  category: Category,
  images: number,
  videos: number,
  videoDetails: VideoDetail[],
) {
  const normalized = normalizeCategory(category);
  if (normalized.countMode !== "duration") return images + videos;
  const secondsPerUnit = normalized.unitSeconds || 30;
  const detailedUnits = videoDetails.reduce(
    (sum, video) =>
      sum +
      (video.durationSeconds == null
        ? 1
        : Math.max(0, Math.round(video.durationSeconds / secondsPerUnit))),
    0,
  );
  return detailedUnits + Math.max(0, videos - videoDetails.length);
}

function inferTeam(person: Omit<Person, "team"> & { team?: string }) {
  if (person.team?.trim()) return person.team.trim();
  if (person.role.includes("口播")) return "口播组";
  if (person.role.includes("内容")) return "内容组";
  if (
    person.role.toUpperCase().includes("AI") ||
    person.categories.some((category) => category.name.toUpperCase().includes("AI"))
  ) {
    return "AI组";
  }
  return "未分组";
}

export default function Dashboard() {
  const [panel, setPanel] = useState<Panel>("people");
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [people, setPeople] = useState<Person[]>(initialPeople);
  const [checkins, setCheckins] = useState<Checkins>(seedCheckins);
  const [dailyQuotas, setDailyQuotas] = useState<DailyQuotas>({});
  const [records, setRecords] = useState<DriveRecord[]>(seedRecords);
  const [ready, setReady] = useState(false);
  const [showPersonForm, setShowPersonForm] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkPersonId, setLinkPersonId] = useState("");
  const [scanInProgress, setScanInProgress] = useState(false);
  const [showArchivedPeople, setShowArchivedPeople] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Person | null>(null);
  const [deleteConfirmStep, setDeleteConfirmStep] = useState<1 | 2>(1);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [editingDailyQuota, setEditingDailyQuota] = useState<{
    personId: string;
    date: string;
  } | null>(null);
  const [dailyQuotaDraft, setDailyQuotaDraft] = useState<Category[]>([]);
  const [toast, setToast] = useState("");
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [serverAuthInitialized, setServerAuthInitialized] = useState<
    boolean | null
  >(null);
  const [accessSession, setAccessSession] = useState<AccessSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loginMode, setLoginMode] = useState<"staff" | "admin">("staff");
  const [loginPersonId, setLoginPersonId] = useState(initialPeople[0].id);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [leaderPinDrafts, setLeaderPinDrafts] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    queueMicrotask(() => {
      const loadedPeople = safeLoad<Person[]>(
        "quota.people",
        initialPeople,
      ).map((person, index) => {
          const migratedPerson = person as Person & { team?: string };
          return {
            ...migratedPerson,
            team: inferTeam(migratedPerson),
            categories: migratedPerson.categories.map(normalizeCategory),
            accent: colors[index % colors.length],
          };
        });
      setPeople(loadedPeople);
      setSelectedTeam(safeLoad("quota.selectedTeam", "all"));
      setCheckins(safeLoad("quota.checkins", seedCheckins));
      setDailyQuotas(safeLoad("quota.dailyQuotas", {}));
      const migratedRecords = safeLoad<DriveRecord[]>(
        "quota.driveRecords",
        seedRecords,
      ).map(
          (record) => {
            const migratedRecord = {
              ...record,
              folderId: record.folderId || extractDriveFolderId(record.url),
            };
            if (record.categoryName) return migratedRecord;
            const person = loadedPeople.find(
              (item) => item.id === record.personId,
            );
            const category =
              (record.images >= record.videos
                ? person?.categories.find((item) =>
                    /AI|图/i.test(item.name),
                  )
                : person?.categories.find((item) =>
                    /flow|口播/i.test(item.name),
                  )) ?? person?.categories[0];
            return {
              ...migratedRecord,
              categoryName: category?.name ?? "未分类",
              countedUnits: driveTotal(record),
              countMode: category?.countMode,
              unitSeconds: category?.unitSeconds,
            };
          },
      );
      const seenFolders = new Set<string>();
      setRecords(
        migratedRecords.filter((record) => {
          if (!record.folderId) return true;
          const key = `${record.date}:${record.folderId}`;
          if (seenFolders.has(key)) return false;
          seenFolders.add(key);
          return true;
        }),
      );
      setAuthConfig(safeLoad<AuthConfig | null>("quota.auth", null));
      try {
        const storedSession = window.sessionStorage.getItem("quota.session");
        if (storedSession) {
          const parsed = JSON.parse(storedSession) as AccessSession;
          if (
            parsed.kind === "admin" ||
            ((parsed.kind === "employee" || parsed.kind === "leader") &&
              loadedPeople.some(
                (person) =>
                  person.id === parsed.personId &&
                  person.status !== "archived" &&
                  (parsed.kind !== "leader" || person.isLeader),
              ))
          ) {
            setAccessSession(parsed);
          }
        }
      } catch {
        window.sessionStorage.removeItem("quota.session");
      }
      setReady(true);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem("quota.people", JSON.stringify(people));
    window.localStorage.setItem("quota.selectedTeam", selectedTeam);
    window.localStorage.setItem("quota.checkins", JSON.stringify(checkins));
    window.localStorage.setItem(
      "quota.dailyQuotas",
      JSON.stringify(dailyQuotas),
    );
    window.localStorage.setItem("quota.driveRecords", JSON.stringify(records));
  }, [people, selectedTeam, checkins, dailyQuotas, records, ready]);

  useEffect(() => {
    if (!authReady || !authConfig) return;
    window.localStorage.setItem("quota.auth", JSON.stringify(authConfig));
  }, [authConfig, authReady]);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    async function initializeServerAuth() {
      try {
        const statusResponse = await fetch("/api/auth/status", {
          cache: "no-store",
        });
        const status = (await statusResponse.json()) as {
          initialized?: boolean;
          error?: string;
        };
        if (!statusResponse.ok) throw new Error(status.error || "安全服务不可用");
        if (status.initialized || !authConfig) {
          if (!cancelled) setServerAuthInitialized(Boolean(status.initialized));
          return;
        }
        const migrateResponse = await fetch("/api/auth/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(authConfig),
        });
        const migrated = (await migrateResponse.json()) as {
          initialized?: boolean;
          error?: string;
        };
        if (!migrateResponse.ok) {
          throw new Error(migrated.error || "旧密码配置迁移失败");
        }
        if (!cancelled) setServerAuthInitialized(true);
      } catch (error) {
        if (!cancelled) {
          setAuthMessage(
            error instanceof Error ? error.message : "安全服务暂时不可用",
          );
          setServerAuthInitialized(false);
        }
      }
    }
    void initializeServerAuth();
    return () => {
      cancelled = true;
    };
  }, [authReady]);

  useEffect(() => {
    if (!authReady || !accessSession || !serverAuthInitialized) return;
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" }).then((response) => {
      if (!cancelled && !response.ok) setAccessSession(null);
    });
    return () => {
      cancelled = true;
    };
  }, [authReady, serverAuthInitialized]);

  useEffect(() => {
    if (!authReady) return;
    if (accessSession) {
      window.sessionStorage.setItem(
        "quota.session",
        JSON.stringify(accessSession),
      );
    } else {
      window.sessionStorage.removeItem("quota.session");
    }
  }, [accessSession, authReady]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const dates = useMemo(() => latestDates(), []);
  const teams = useMemo(
    () =>
      Array.from(new Set(people.map((person) => person.team))).sort((a, b) =>
        a.localeCompare(b, "zh-CN"),
      ),
    [people],
  );
  const visiblePeople = useMemo(() => {
    if (accessSession?.kind === "employee") {
      return people.filter((person) => person.id === accessSession.personId);
    }
    return people.filter(
      (person) => selectedTeam === "all" || person.team === selectedTeam,
    );
  }, [accessSession, people, selectedTeam]);
  const activePeople = useMemo(
    () => visiblePeople.filter((person) => person.status !== "archived"),
    [visiblePeople],
  );
  const archivedPeople = useMemo(
    () => visiblePeople.filter((person) => person.status === "archived"),
    [visiblePeople],
  );
  const linkPerson =
    activePeople.find((person) => person.id === linkPersonId) ?? activePeople[0];
  const monthLabel = `${today.getFullYear()}年${today.getMonth() + 1}月`;
  const canManage =
    accessSession?.kind === "leader" || accessSession?.kind === "admin";
  const currentPerson =
    accessSession && accessSession.kind !== "admin"
      ? people.find((person) => person.id === accessSession.personId)
      : undefined;

  async function setupAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const staffPassword = String(form.get("staffPassword") ?? "");
    const adminPassword = String(form.get("adminPassword") ?? "");
    const adminConfirm = String(form.get("adminConfirm") ?? "");
    if (staffPassword.length < 4) {
      setAuthMessage("全员共用密码至少需要4位");
      return;
    }
    if (adminPassword.length < 6) {
      setAuthMessage("管理员密码至少需要6位");
      return;
    }
    if (adminPassword !== adminConfirm) {
      setAuthMessage("两次输入的管理员密码不一致");
      return;
    }
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const [staff, admin] = await Promise.all([
        createSecretHash(staffPassword),
        createSecretHash(adminPassword),
      ]);
      const nextConfig: AuthConfig = {
        version: 1,
        staff,
        admin,
        leaderPins: {},
      };
      const response = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextConfig),
      });
      const result = (await response.json()) as {
        initialized?: boolean;
        error?: string;
      };
      if (!response.ok) {
        setAuthMessage(result.error || "密码设置未能保存，请稍后重试");
        return;
      }
      setAuthConfig(nextConfig);
      setServerAuthInitialized(true);
      setLoginMode("admin");
      setAuthMessage("设置完成，请使用管理员密码进入并指定组长");
    } finally {
      setAuthBusy(false);
    }
  }

  async function loginStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const personId = String(form.get("personId") ?? "");
    const password = String(form.get("password") ?? "");
    const leaderPin = String(form.get("leaderPin") ?? "");
    const person = people.find(
      (item) => item.id === personId && item.status !== "archived",
    );
    if (!person) {
      setAuthMessage("请选择自己的姓名");
      return;
    }
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { response, result } = await requestLogin(
        {
          mode: "staff",
          personId: person.id,
          password,
          leaderPin,
        },
        password,
        leaderPin,
      );
      if (!response.ok) {
        setAuthMessage(result.error || "登录失败，请稍后重试");
        return;
      }
      if (result.role === "leader") {
        setAccessSession({ kind: "leader", personId: person.id });
        setSelectedTeam("all");
      } else {
        setAccessSession({ kind: "employee", personId: person.id });
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function loginAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const { response, result } = await requestLogin(
        { mode: "admin", password },
        password,
      );
      if (!response.ok) {
        setAuthMessage(result.error || "管理员登录失败");
        return;
      }
      setAccessSession({ kind: "admin" });
    } finally {
      setAuthBusy(false);
    }
  }

  function logout() {
    void fetch("/api/auth/logout", { method: "POST" });
    setAccessSession(null);
    setAuthMessage("");
    setPanel("people");
  }

  async function makeLeader(person: Person) {
    const pin = leaderPinDrafts[person.id] ?? "";
    if (pin.length < 4) {
      setAuthMessage("组长 PIN 至少需要4位");
      return;
    }
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const secret = await createSecretHash(pin);
      const response = await fetch("/api/auth/leader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: person.id, secret }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setAuthMessage(result.error || "组长权限保存失败");
        return;
      }
      if (authConfig) {
        setAuthConfig({
          ...authConfig,
          leaderPins: { ...authConfig.leaderPins, [person.id]: secret },
        });
      }
      setPeople((current) =>
        current.map((item) =>
          item.id === person.id ? { ...item, isLeader: true } : item,
        ),
      );
      setLeaderPinDrafts((current) => ({ ...current, [person.id]: "" }));
      setToast(person.isLeader ? "组长 PIN 已更新" : `${person.name}已设为组长`);
    } finally {
      setAuthBusy(false);
    }
  }

  async function removeLeader(person: Person) {
    setAuthBusy(true);
    setAuthMessage("");
    try {
      const response = await fetch("/api/auth/leader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId: person.id, remove: true }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setAuthMessage(result.error || "取消组长权限失败");
        return;
      }
      if (authConfig) {
        const nextPins = { ...authConfig.leaderPins };
        delete nextPins[person.id];
        setAuthConfig({ ...authConfig, leaderPins: nextPins });
      }
      setPeople((current) =>
        current.map((item) =>
          item.id === person.id ? { ...item, isLeader: false } : item,
        ),
      );
      setToast(`已取消${person.name}的组长权限`);
    } finally {
      setAuthBusy(false);
    }
  }

  function valueFor(personId: string, date: string, slot: Slot) {
    return checkins[date]?.[personId]?.[slot] ?? "";
  }

  function dayTotal(personId: string, date: string) {
    const values = checkins[date]?.[personId] ?? {};
    return slots.reduce((sum, slot) => sum + Number(values[slot.key] ?? 0), 0);
  }

  function categoriesForDate(person: Person, date: string) {
    return (dailyQuotas[date]?.[person.id] ?? person.categories).map(
      normalizeCategory,
    );
  }

  function quotaForDate(person: Person, date: string) {
    return categoriesForDate(person, date).reduce(
      (sum, category) => sum + category.daily,
      0,
    );
  }

  function openDailyQuota(person: Person, date: string) {
    if (!canManage) return;
    setEditingDailyQuota({ personId: person.id, date });
    setDailyQuotaDraft(
      categoriesForDate(person, date).map((category) => ({ ...category })),
    );
  }

  function updateDailyQuotaDraft(
    index: number,
    field: "name" | "daily",
    value: string,
  ) {
    setDailyQuotaDraft((current) =>
      current.map((category, categoryIndex) =>
        categoryIndex === index
          ? {
              ...category,
              [field]:
                field === "daily" ? Math.max(0, Number(value) || 0) : value,
            }
          : category,
      ),
    );
  }

  function saveDailyQuota(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !editingDailyQuota) return;
    const categories = dailyQuotaDraft
      .map((category) => ({
        ...category,
        name: category.name.trim(),
        daily: Math.max(0, category.daily),
      }))
      .filter((category) => category.name);
    if (!categories.length) {
      setToast("请至少保留一个当日定量类型");
      return;
    }
    setDailyQuotas((current) => ({
      ...current,
      [editingDailyQuota.date]: {
        ...(current[editingDailyQuota.date] ?? {}),
        [editingDailyQuota.personId]: categories,
      },
    }));
    const form = new FormData(event.currentTarget);
    if (form.get("useAsDefault") === "on") {
      setPeople((current) =>
        current.map((person) => {
          if (person.id !== editingDailyQuota.personId) return person;
          return {
            ...person,
            categories: categories.map((category) => ({
              ...category,
              monthly:
                person.categories.find((item) => item.name === category.name)
                  ?.monthly ?? category.monthly,
            })),
          };
        }),
      );
    }
    setEditingDailyQuota(null);
    setToast("当日定额已更新");
  }

  function resetDailyQuota() {
    if (!canManage || !editingDailyQuota) return;
    setDailyQuotas((current) => {
      const dateQuotas = { ...(current[editingDailyQuota.date] ?? {}) };
      delete dateQuotas[editingDailyQuota.personId];
      if (Object.keys(dateQuotas).length === 0) {
        const next = { ...current };
        delete next[editingDailyQuota.date];
        return next;
      }
      return { ...current, [editingDailyQuota.date]: dateQuotas };
    });
    setEditingDailyQuota(null);
    setToast("已恢复该人员当天的默认定额");
  }

  function updateCheckin(
    personId: string,
    date: string,
    slot: Slot,
    value: string,
  ) {
    if (
      accessSession?.kind === "employee" &&
      accessSession.personId !== personId
    ) {
      return;
    }
    const amount = value === "" ? undefined : Math.max(0, Number(value));
    setCheckins((current) => ({
      ...current,
      [date]: {
        ...(current[date] ?? {}),
        [personId]: {
          ...(current[date]?.[personId] ?? {}),
          [slot]:
            typeof amount === "number" && Number.isFinite(amount)
              ? amount
              : undefined,
        },
      },
    }));
  }

  function actualFor(personId: string, date = todayKey) {
    return records
      .filter((item) => item.personId === personId && item.date === date)
      .reduce(
        (sum, item) => ({
          images: sum.images + item.images,
          videos: sum.videos + item.videos,
          selected: sum.selected + item.selected,
          selectedFolders:
            sum.selectedFolders + Number(item.selectedFolders ?? 0),
          videoDurationSeconds:
            sum.videoDurationSeconds + Number(item.videoDurationSeconds ?? 0),
          videoDurationUnavailable:
            sum.videoDurationUnavailable +
            Number(item.videoDurationUnavailable ?? 0),
          countedUnits: sum.countedUnits + recordUnits(item),
        }),
        {
          images: 0,
          videos: 0,
          selected: 0,
          selectedFolders: 0,
          videoDurationSeconds: 0,
          videoDurationUnavailable: 0,
          countedUnits: 0,
        },
      );
  }

  function monthlyReported(personId: string) {
    return Object.values(checkins).reduce(
      (sum, day) =>
        sum +
        slots.reduce(
          (slotSum, slot) =>
            slotSum + Number(day[personId]?.[slot.key] ?? 0),
          0,
        ),
      0,
    );
  }

  function csvCell(value: string | number) {
    let text = String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }

  function buildCheckinRows(): (string | number)[][] {
    const headers = [
      "日期",
      "小组",
      "姓名",
      "人员状态",
      "当日分类定额",
      "定额合计",
      "中午",
      "下午",
      "晚上",
      "当日完成",
      "达标状态",
    ];
    const elapsedDates = Array.from({ length: today.getDate() }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth(), index + 1);
      return toDateKey(date);
    }).reverse();
    const rows = elapsedDates.flatMap((date) =>
      visiblePeople.map((person) => {
        const categories = categoriesForDate(person, date);
        const quota = quotaForDate(person, date);
        const noon = valueFor(person.id, date, "noon");
        const afternoon = valueFor(person.id, date, "afternoon");
        const evening = valueFor(person.id, date, "evening");
        const hasValue = [noon, afternoon, evening].some(
          (value) => value !== "",
        );
        const total = dayTotal(person.id, date);
        return [
          date,
          person.team,
          person.name,
          person.status === "archived" ? "已离组" : "在组",
          categories
            .map((category) => `${category.name}:${category.daily}`)
            .join("；"),
          quota,
          noon,
          afternoon,
          evening,
          total,
          hasValue ? (total >= quota ? "已达标" : "未达标") : "未报数",
        ];
      }),
    );
    return [headers, ...rows];
  }

  function buildCheckinCsv() {
    return buildCheckinRows()
      .map((row) => row.map((cell) => csvCell(cell)).join(","))
      .join("\r\n");
  }

  function buildCheckinTableText() {
    return buildCheckinRows()
      .map((row) =>
        row
          .map((cell) => {
            let text = String(cell).replace(/[\t\r\n]+/g, " ");
            if (/^[=+\-@]/.test(text)) text = `'${text}`;
            return text;
          })
          .join("\t"),
      )
      .join("\r\n");
  }

  function downloadCheckinCsv() {
    const csv = buildCheckinCsv();
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const teamName =
      selectedTeam === "all"
        ? "全部小组"
        : selectedTeam.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
    anchor.download = `量见-${teamName}-${today.getFullYear()}-${String(
      today.getMonth() + 1,
    ).padStart(2, "0")}-打卡.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setToast("本月打卡 CSV 已导出");
  }

  async function copyCheckinTable() {
    try {
      await navigator.clipboard.writeText(buildCheckinTableText());
      setToast("已复制为表格，选中一个单元格即可粘贴");
    } catch {
      setToast("复制失败，请使用“导出本月 CSV”");
    }
  }

  function openPerson(person?: Person) {
    if (!canManage) return;
    setEditingPerson(person ?? null);
    setShowPersonForm(true);
  }

  function openLinkForm() {
    if (!activePeople.length) {
      setToast("当前小组没有可选择的在组人员");
      return;
    }
    setLinkPersonId(activePeople[0].id);
    setShowLinkForm(true);
  }

  function savePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    const form = new FormData(event.currentTarget);
    const names = form.getAll("categoryName").map(String);
    const monthlies = form.getAll("categoryMonthly").map(Number);
    const dailies = form.getAll("categoryDaily").map(Number);
    const countModes = form.getAll("categoryCountMode").map(String);
    const unitSeconds = form.getAll("categoryUnitSeconds").map(Number);
    const categories = names
      .map((name, index) => ({
        name: name.trim(),
        monthly: Math.max(0, monthlies[index] || 0),
        daily: Math.max(0, dailies[index] || 0),
        countMode:
          countModes[index] === "duration"
            ? ("duration" as const)
            : ("file" as const),
        unitSeconds:
          countModes[index] === "duration"
            ? Math.max(1, unitSeconds[index] || 30)
            : undefined,
      }))
      .filter((item) => item.name);
    const person: Person = {
      id: editingPerson?.id ?? crypto.randomUUID(),
      name: String(form.get("name") ?? "").trim(),
      role: String(form.get("role") ?? "").trim() || "内容制作",
      team: String(form.get("team") ?? "").trim() || "未分组",
      accent:
        editingPerson?.accent ??
        colors[Math.max(0, people.length % colors.length)],
      categories,
      status: editingPerson?.status ?? "active",
      archivedAt: editingPerson?.archivedAt,
      isLeader: editingPerson?.isLeader,
    };
    if (!person.name || categories.length === 0) {
      setToast("请填写姓名和至少一个定量类型");
      return;
    }
    setPeople((current) =>
      editingPerson
        ? current.map((item) => (item.id === person.id ? person : item))
        : [...current, person],
    );
    setShowPersonForm(false);
    setToast(editingPerson ? "人员定量已更新" : "人员已新增");
  }

  function archivePerson(personId: string) {
    if (!canManage) return;
    setPeople((current) =>
      current.map((person) =>
        person.id === personId
          ? {
              ...person,
              status: "archived",
              archivedAt: new Date().toISOString(),
            }
          : person,
      ),
    );
    setShowPersonForm(false);
    setEditingPerson(null);
    setToast("人员已离组归档，历史数据完整保留");
  }

  function restorePerson(personId: string) {
    if (!canManage) return;
    setPeople((current) =>
      current.map((person) =>
        person.id === personId
          ? { ...person, status: "active", archivedAt: undefined }
          : person,
      ),
    );
    setToast("人员已恢复到当前团队");
  }

  function openDeleteConfirmation(person: Person) {
    if (!canManage) return;
    setDeleteCandidate(person);
    setDeleteConfirmStep(1);
  }

  function permanentlyDeletePerson() {
    if (
      !canManage ||
      !deleteCandidate ||
      deleteCandidate.status !== "archived"
    ) {
      return;
    }
    const personId = deleteCandidate.id;
    setPeople((current) =>
      current.filter((person) => person.id !== personId),
    );
    setCheckins(
      (current) =>
        Object.fromEntries(
          Object.entries(current).map(([date, day]) => {
            const nextDay = { ...day };
            delete nextDay[personId];
            return [date, nextDay];
          }),
        ) as Checkins,
    );
    setDailyQuotas(
      (current) =>
        Object.fromEntries(
          Object.entries(current).map(([date, quotas]) => {
            const nextQuotas = { ...quotas };
            delete nextQuotas[personId];
            return [date, nextQuotas];
          }),
        ) as DailyQuotas,
    );
    setRecords((current) =>
      current.filter((record) => record.personId !== personId),
    );
    if (authConfig?.leaderPins[personId]) {
      const nextPins = { ...authConfig.leaderPins };
      delete nextPins[personId];
      setAuthConfig({ ...authConfig, leaderPins: nextPins });
    }
    setDeleteCandidate(null);
    setShowArchivedPeople(false);
    setToast(`${deleteCandidate.name}及其全部数据已永久删除`);
  }

  async function scanFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (scanInProgress) {
      setToast("当前链接正在检测，请稍候");
      return;
    }
    const form = new FormData(event.currentTarget);
    const personId = String(form.get("personId") ?? "");
    const categoryName = String(form.get("categoryName") ?? "");
    const url = String(form.get("url") ?? "").trim();
    const folderId = extractDriveFolderId(url);
    const person = activePeople.find((item) => item.id === personId);
    const category = person
      ? categoriesForDate(person, todayKey).find(
          (item) => item.name === categoryName,
        )
      : undefined;
    if (!person || !category) {
      setToast("请选择人员和本次上传的制作类型");
      return;
    }
    if (
      folderId &&
      records.some(
        (item) =>
          item.date === todayKey &&
          (item.folderId || extractDriveFolderId(item.url)) === folderId,
      )
    ) {
      setToast("这个 Google Drive 文件夹今天已经检测过，不能重复计入");
      return;
    }
    setScanInProgress(true);
    setToast("正在安全读取文件夹…");
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as {
        error?: string;
        folderName?: string;
        images?: number;
        videos?: number;
        selected?: number;
        selectedFolders?: number;
        videoDurationSeconds?: number;
        videoDurationUnavailable?: number;
        videoDetails?: VideoDetail[];
        videoDetailsTruncated?: boolean;
      };
      if (!response.ok) throw new Error(data.error || "检测失败");
      const videoDetails = data.videoDetails || [];
      const countedUnits = calculateCountedUnits(
        category,
        data.images || 0,
        data.videos || 0,
        videoDetails,
      );
      setRecords((current) => [
        {
          id: crypto.randomUUID(),
          personId,
          date: todayKey,
          url,
          folderId,
          folderName: data.folderName || "Google Drive 文件夹",
          images: data.images || 0,
          videos: data.videos || 0,
          selected: data.selected || 0,
          selectedFolders: data.selectedFolders || 0,
          videoDurationSeconds: data.videoDurationSeconds || 0,
          videoDurationUnavailable: data.videoDurationUnavailable || 0,
          videoDetails,
          videoDetailsTruncated: Boolean(data.videoDetailsTruncated),
          categoryName: category.name,
          countedUnits,
          countMode: category.countMode,
          unitSeconds: category.unitSeconds,
        },
        ...current,
      ]);
      setShowLinkForm(false);
      setToast(`检测完成，本链接折算为 ${countedUnits} 个完成量`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "检测失败，请稍后重试");
    } finally {
      setScanInProgress(false);
    }
  }

  if (!authReady || serverAuthInitialized === null) {
    return (
      <div className="auth-screen">
        <div className="auth-loading">正在打开团队产量台…</div>
      </div>
    );
  }

  if (!serverAuthInitialized) {
    return (
      <div className="auth-screen">
        <section className="auth-card setup-card">
          <div className="auth-brand">
            <span className="brand-mark">量</span>
            <span>
              <strong>量见</strong>
              <small>首次使用设置</small>
            </span>
          </div>
          <p className="eyebrow">只需设置一次</p>
          <h1>建立团队访问密码</h1>
          <p className="auth-copy">
            全体员工共用一个密码；管理员密码用于进入完整工作台并设置组长。
          </p>
          <form className="auth-form" onSubmit={setupAccess}>
            <label>
              全员共用密码
              <SecretInput
                name="staffPassword"
                minLength={4}
                autoComplete="new-password"
                placeholder="至少4位"
                required
              />
            </label>
            <label>
              管理员密码
              <SecretInput
                name="adminPassword"
                minLength={6}
                autoComplete="new-password"
                placeholder="至少6位"
                required
              />
            </label>
            <label>
              再输一次管理员密码
              <SecretInput
                name="adminConfirm"
                minLength={6}
                autoComplete="new-password"
                required
              />
            </label>
            {authMessage && <p className="auth-message">{authMessage}</p>}
            <button className="primary full" type="submit" disabled={authBusy}>
              {authBusy ? "正在安全保存…" : "完成设置"}
            </button>
          </form>
          <p className="auth-footnote">密码只保存为不可直接还原的加密摘要。</p>
        </section>
      </div>
    );
  }

  if (!accessSession) {
    const selectedLoginPerson = people.find(
      (person) => person.id === loginPersonId,
    );
    return (
      <div className="auth-screen">
        <section className="auth-card">
          <div className="auth-brand">
            <span className="brand-mark">量</span>
            <span>
              <strong>量见</strong>
              <small>团队产量台</small>
            </span>
          </div>
          <div className="login-tabs" role="tablist" aria-label="登录方式">
            <button
              type="button"
              className={loginMode === "staff" ? "active" : ""}
              onClick={() => {
                setLoginMode("staff");
                setAuthMessage("");
              }}
            >
              员工 / 组长
            </button>
            <button
              type="button"
              className={loginMode === "admin" ? "active" : ""}
              onClick={() => {
                setLoginMode("admin");
                setAuthMessage("");
              }}
            >
              管理员
            </button>
          </div>
          {loginMode === "staff" ? (
            <>
              <p className="eyebrow">选择自己的姓名</p>
              <h1>查看今日定量</h1>
              <form className="auth-form" onSubmit={loginStaff}>
                <label>
                  我的姓名
                  <select
                    name="personId"
                    value={loginPersonId}
                    onChange={(event) => setLoginPersonId(event.target.value)}
                    required
                  >
                    {people
                      .filter((person) => person.status !== "archived")
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name} · {person.team}
                          {person.isLeader ? " · 组长" : ""}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  全员共用密码
                  <SecretInput
                    name="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                {selectedLoginPerson?.isLeader && (
                  <label>
                    组长 PIN
                    <SecretInput
                      name="leaderPin"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="不填写则以普通员工身份进入"
                    />
                    <small>填写 PIN 后可以查看所有人并调整定额</small>
                  </label>
                )}
                {authMessage && <p className="auth-message">{authMessage}</p>}
                <button
                  className="primary full"
                  type="submit"
                  disabled={authBusy}
                >
                  {authBusy
                    ? "正在进入…"
                    : selectedLoginPerson?.isLeader
                      ? "进入产量台"
                      : "查看我的数据"}
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="eyebrow">权限设置</p>
              <h1>管理员进入</h1>
              <p className="auth-copy">
                管理员拥有全部工作台功能，并额外负责指定或取消组长。
              </p>
              <form className="auth-form" onSubmit={loginAdmin}>
                <label>
                  管理员密码
                  <SecretInput
                    name="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                {authMessage && <p className="auth-message">{authMessage}</p>}
                <button
                  className="primary full"
                  type="submit"
                  disabled={authBusy}
                >
                  {authBusy ? "正在验证…" : "进入管理员工作台"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">量</span>
          <span>
            <strong>量见</strong>
            <small>团队产量台</small>
          </span>
        </div>
        <nav aria-label="主要导航">
          <button
            className={panel === "people" ? "active" : ""}
            onClick={() => setPanel("people")}
          >
            <span>◉</span>人员面板
          </button>
          <button
            className={panel === "checkin" ? "active" : ""}
            onClick={() => setPanel("checkin")}
          >
            <span>✓</span>报数打卡
          </button>
          <button
            className={panel === "drive" ? "active" : ""}
            onClick={() => setPanel("drive")}
          >
            <span>◇</span>实际产量
          </button>
          {accessSession.kind === "admin" && (
            <button
              className={panel === "permissions" ? "active" : ""}
              onClick={() => setPanel("permissions")}
            >
              <span>⚙</span>权限设置
            </button>
          )}
        </nav>
        <div className="security-note">
          <span>
            {accessSession.kind === "admin"
              ? "管理员模式"
              : canManage
                ? "组长模式"
                : "员工模式"}
          </span>
          <p>
            {accessSession.kind === "admin"
              ? "拥有完整工作台，并可设置组长权限。"
              : canManage
                ? "可查看所有人员并调整定额。"
                : "当前只显示你自己的定量与完成记录。"}
          </p>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">
              {monthLabel} ·{" "}
              {selectedTeam === "all" ? "全部小组" : selectedTeam}
            </p>
            <h1>
              {panel === "people" && "人员定量看板"}
              {panel === "checkin" && "每日报数打卡"}
              {panel === "drive" && "云端实际产量"}
              {panel === "permissions" && "组长权限设置"}
            </h1>
          </div>
          <div className="top-actions">
            {canManage && (
              <label className="team-switcher">
                <span>查看小组</span>
                <select
                  value={selectedTeam}
                  onChange={(event) => setSelectedTeam(event.target.value)}
                  aria-label="选择要查看的小组"
                >
                  <option value="all">全部小组</option>
                  {teams.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <span className="identity-pill">
              <b>
                {accessSession.kind === "admin"
                  ? "管理员"
                  : currentPerson?.name}
              </b>
              <small>
                {accessSession.kind === "admin"
                  ? "管理员"
                  : canManage
                    ? "组长"
                    : "员工"}
              </small>
            </span>
            <span className="date-pill">
              {today.getMonth() + 1}月{today.getDate()}日
            </span>
            {panel === "people" && canManage && (
              <>
                <button
                  className="secondary"
                  onClick={() => setShowArchivedPeople(true)}
                >
                  已离组 {archivedPeople.length}
                </button>
                <button className="primary" onClick={() => openPerson()}>
                  ＋ 新增人员
                </button>
              </>
            )}
            {panel === "drive" && (
              <button className="primary" onClick={openLinkForm}>
                ＋ 检测链接
              </button>
            )}
            <button className="logout-button" type="button" onClick={logout}>
              退出
            </button>
          </div>
        </header>

        {panel === "people" && (
          <section className="panel people-panel">
            <div className="panel-intro">
              <div>
                <p>本月团队</p>
                <strong>{activePeople.length} 人</strong>
              </div>
              <div>
                <p>月定量</p>
                <strong>
                  {activePeople.reduce(
                    (sum, person) => sum + monthlyQuota(person),
                    0,
                  )}
                </strong>
              </div>
              <div>
                <p>今日已报</p>
                <strong>
                  {activePeople.reduce(
                    (sum, person) => sum + dayTotal(person.id, todayKey),
                    0,
                  )}
                </strong>
              </div>
              <div>
                <p>距月末</p>
                <strong>
                  {new Date(
                    today.getFullYear(),
                    today.getMonth() + 1,
                    0,
                  ).getDate() - today.getDate()}
                  天
                </strong>
              </div>
            </div>

            <div className="people-grid">
              {activePeople.map((person) => {
                const quota = monthlyQuota(person);
                const completed = monthlyReported(person.id);
                const todayDone = dayTotal(person.id, todayKey);
                const todayCategories = categoriesForDate(person, todayKey);
                const todayQuota = quotaForDate(person, todayKey);
                const percentage = quota
                  ? Math.min(100, Math.round((completed / quota) * 100))
                  : 0;
                return (
                  <article
                    className="person-card"
                    key={person.id}
                    style={{ "--accent": person.accent } as React.CSSProperties}
                  >
                    <div className="person-head">
                      <div className="avatar">{initials(person.name)}</div>
                      <div>
                        <h2>{person.name}</h2>
                        <p>
                          {person.role} · {person.team}
                        </p>
                      </div>
                      {canManage && (
                        <button
                          className="icon-button"
                          aria-label={`编辑${person.name}`}
                          onClick={() => openPerson(person)}
                        >
                          ···
                        </button>
                      )}
                    </div>

                    <div className="monthly-progress">
                      <div className="progress-copy">
                        <span>本月完成进度</span>
                        <span>
                          已完成 {completed} / {quota}
                        </span>
                      </div>
                      <div
                        className="progress-track"
                        role="progressbar"
                        aria-label={`${person.name}本月完成进度`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percentage}
                      >
                        <span style={{ width: `${percentage}%` }} />
                      </div>
                      <strong className="progress-value">{percentage}%</strong>
                    </div>

                    <div className="person-metrics">
                      <div>
                        <span>今日完成</span>
                        <strong>{todayDone}</strong>
                      </div>
                      <div>
                        <span>今日定量</span>
                        <strong>{todayQuota}</strong>
                      </div>
                      <div>
                        <span>本月还差</span>
                        <strong>{Math.max(0, quota - completed)}</strong>
                      </div>
                    </div>

                    <div className="category-heading">
                      <strong>今日分类定量</strong>
                      <span>
                        {dailyQuotas[todayKey]?.[person.id]
                          ? "今日已调整"
                          : "使用默认值"}
                      </span>
                    </div>
                    <div className="category-list">
                      {todayCategories.map((category) => (
                        <div key={category.name}>
                          <span className="category-name">{category.name}</span>
                          <p>
                            <strong>{category.daily}</strong>
                            <small> / 天</small>
                          </p>
                          <small>
                            {category.monthly
                              ? `月定量 ${category.monthly}`
                              : "今日临时增加"}
                          </small>
                          <small className="count-rule">
                            {countRuleLabel(category)}
                          </small>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
              {canManage && (
                <button className="add-card" onClick={() => openPerson()}>
                  <span>＋</span>
                  <strong>新增人员</strong>
                  <small>设置定量与制作类型</small>
                </button>
              )}
            </div>
          </section>
        )}

        {panel === "checkin" && (
          <section className="panel checkin-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">最新日期始终在最前</p>
                <h2>中午、下午、晚上三次报数</h2>
              </div>
              <div className="checkin-heading-tools">
                {canManage && (
                  <div className="export-actions">
                    <button className="secondary" onClick={copyCheckinTable}>
                      复制为表格
                    </button>
                    <button className="primary" onClick={downloadCheckinCsv}>
                      导出本月 CSV
                    </button>
                  </div>
                )}
                <div className="legend">
                  <span className="done">已达标</span>
                  <span className="miss">未达标</span>
                  <span className="waiting">待报数</span>
                </div>
              </div>
            </div>
            <div className="table-wrap">
              <table className="checkin-table">
                <thead>
                  <tr>
                    <th rowSpan={2} className="sticky-col person-col">
                      人员
                    </th>
                    <th rowSpan={2} className="sticky-col quota-col">
                      默认定量 / 类型
                    </th>
                    {dates.map((date) => (
                      <th colSpan={3} key={date.key}>
                        {date.label}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {dates.flatMap((date) =>
                      slots.map((slot) => (
                        <th key={`${date.key}-${slot.key}`}>{slot.label}</th>
                      )),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {activePeople.map((person) => (
                    <tr key={person.id}>
                      <td className="sticky-col person-col">
                        <div className="table-person">
                          <span style={{ background: person.accent }}>
                            {initials(person.name)}
                          </span>
                          <strong>{person.name}</strong>
                        </div>
                      </td>
                      <td className="sticky-col quota-col">
                        {person.categories.map((category) => (
                          <span className="quota-chip" key={category.name}>
                            {category.name} {category.daily}
                          </span>
                        ))}
                      </td>
                      {dates.flatMap((date) => {
                        const total = dayTotal(person.id, date.key);
                        const dateQuota = quotaForDate(person, date.key);
                        const hasValue = slots.some(
                          (slot) =>
                            valueFor(person.id, date.key, slot.key) !== "",
                        );
                        const status = !hasValue
                          ? "waiting"
                          : total >= dateQuota
                            ? "done"
                            : "miss";
                        return slots.map((slot, slotIndex) => (
                          <td
                            className={`check-cell ${status} ${slotIndex === 0 ? "day-start" : ""}`}
                            key={`${person.id}-${date.key}-${slot.key}`}
                          >
                            {slotIndex === 0 &&
                              (canManage ? (
                                <button
                                  type="button"
                                  className={`daily-quota-button ${
                                    dailyQuotas[date.key]?.[person.id]
                                      ? "adjusted"
                                      : ""
                                  }`}
                                  onClick={() =>
                                    openDailyQuota(person, date.key)
                                  }
                                  aria-label={`调整${person.name}${date.label}定额`}
                                >
                                  定额 {dateQuota}
                                </button>
                              ) : (
                                <span className="daily-quota-label">
                                  定额 {dateQuota}
                                </span>
                              ))}
                            <input
                              aria-label={`${person.name}${date.label}${slot.label}报数`}
                              type="number"
                              min="0"
                              inputMode="numeric"
                              value={valueFor(
                                person.id,
                                date.key,
                                slot.key,
                              )}
                              placeholder="—"
                              onChange={(event) =>
                                updateCheckin(
                                  person.id,
                                  date.key,
                                  slot.key,
                                  event.target.value,
                                )
                              }
                            />
                            {slotIndex === 2 && hasValue && (
                              <small>{total}/{dateQuota}</small>
                            )}
                          </td>
                        ));
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="table-hint">
              点击每天“定额”可单独调整分类与数量；输入报数后自动保存并按当天定额判断状态。
            </p>
          </section>
        )}

        {panel === "drive" && (
          <section className="panel drive-panel">
            <div className="drive-summary-grid">
              {activePeople.map((person) => {
                const actual = actualFor(person.id);
                const rawTotal = actual.images + actual.videos;
                const completed = actual.countedUnits;
                const quota = quotaForDate(person, todayKey);
                const todayCategories = categoriesForDate(person, todayKey);
                const todayRecords = records.filter(
                  (item) =>
                    item.personId === person.id && item.date === todayKey,
                );
                const categoryProgress = todayCategories.map((category) => ({
                  category,
                  completed: todayRecords
                    .filter((record) => record.categoryName === category.name)
                    .reduce((sum, record) => sum + recordUnits(record), 0),
                }));
                const remainingUnits = categoryProgress.reduce(
                  (sum, item) =>
                    sum + Math.max(0, item.category.daily - item.completed),
                  0,
                );
                const allTypesMet =
                  categoryProgress.length > 0 &&
                  categoryProgress.every(
                    (item) => item.completed >= item.category.daily,
                  );
                const rate = rawTotal
                  ? Math.round((actual.selected / rawTotal) * 100)
                  : 0;
                return (
                  <article className="actual-card" key={person.id}>
                    <div className="actual-head">
                      <div
                        className="mini-avatar"
                        style={{ background: person.accent }}
                      >
                        {initials(person.name)}
                      </div>
                      <div>
                        <h2>{person.name}</h2>
                        <p>
                          {
                            todayRecords.length
                          }
                          个链接
                        </p>
                      </div>
                      <span
                        className={`status-tag ${allTypesMet ? "done" : "miss"}`}
                      >
                        {allTypesMet ? "已达标" : "未达标"}
                      </span>
                    </div>
                    <div className="actual-number">
                      <span>今日折算完成</span>
                      <strong>{completed}</strong>
                      <small>/ 定额 {quota}</small>
                    </div>
                    <div className="quality-bar">
                      <span style={{ width: `${Math.min(100, rate)}%` }} />
                    </div>
                    <div className="actual-stats">
                      <div>
                        <span>图片</span>
                        <strong>{actual.images}</strong>
                      </div>
                      <div>
                        <span>视频</span>
                        <strong>{actual.videos}</strong>
                      </div>
                      <div>
                        <span>视频总时长</span>
                        <strong>
                          {actual.videos
                            ? formatSeconds(actual.videoDurationSeconds)
                            : "—"}
                        </strong>
                      </div>
                      <div>
                        <span>已选用</span>
                        <strong>{actual.selected}</strong>
                      </div>
                      <div>
                        <span>选用文件夹</span>
                        <strong>{actual.selectedFolders}</strong>
                      </div>
                      <div>
                        <span>合格率</span>
                        <strong>{rate}%</strong>
                      </div>
                    </div>
                    <div className="actual-type-progress">
                      {categoryProgress.map((item) => (
                        <div key={item.category.name}>
                          <span>
                            <strong>{item.category.name}</strong>
                            <small>{countRuleLabel(item.category)}</small>
                          </span>
                          <b
                            className={
                              item.completed >= item.category.daily
                                ? "done"
                                : "miss"
                            }
                          >
                            {item.completed} / {item.category.daily}
                          </b>
                        </div>
                      ))}
                    </div>
                    <p className="remaining">
                      {allTypesMet
                        ? "今日全部制作类型均已达标"
                        : `各类型合计还差 ${remainingUnits} 个折算量`}
                    </p>
                  </article>
                );
              })}
            </div>

            <div className="link-list">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">逐个链接独立统计</p>
                  <h2>今日 Google Drive 检测记录</h2>
                </div>
                <button
                  className="secondary"
                  onClick={openLinkForm}
                >
                  ＋ 检测新链接
                </button>
              </div>
              <div className="link-table">
                <div className="link-row link-header">
                  <span>人员与文件夹</span>
                  <span>图片</span>
                  <span>视频</span>
                  <span>视频时长</span>
                  <span>折算完成</span>
                  <span>已选用</span>
                  <span>合格率</span>
                </div>
                {records
                  .filter(
                    (record) =>
                      record.date === todayKey &&
                      activePeople.some(
                        (person) => person.id === record.personId,
                      ),
                  )
                  .map((record) => {
                    const person = people.find(
                      (item) => item.id === record.personId,
                    );
                    const total = driveTotal(record);
                    return (
                      <div className="link-row" key={record.id}>
                        <span className="folder-cell">
                          <i>◇</i>
                          <span>
                            <strong>{record.folderName}</strong>
                            <small>
                              {person?.name ?? "未分配"} ·{" "}
                              {record.categoryName ?? "未分类"}
                            </small>
                            <small>
                              识别 {record.selectedFolders ?? 0} 个选用文件夹
                            </small>
                          </span>
                        </span>
                        <strong>{record.images}</strong>
                        <strong>{record.videos}</strong>
                        <span className="duration-cell">
                          <strong>
                            {record.videos
                              ? formatSeconds(record.videoDurationSeconds ?? 0)
                              : "—"}
                          </strong>
                          {record.videoDetails?.length ? (
                            <details>
                              <summary>查看逐条时长</summary>
                              <div>
                                {record.videoDetails.map((video, index) => (
                                  <small key={`${video.name}-${index}`}>
                                    <span title={video.name}>{video.name}</span>
                                    <b>
                                      {video.durationSeconds == null
                                        ? "处理中"
                                        : formatSeconds(video.durationSeconds)}
                                    </b>
                                  </small>
                                ))}
                                {record.videoDetailsTruncated && (
                                  <small>视频较多，仅显示前500条</small>
                                )}
                              </div>
                            </details>
                          ) : (
                            record.videos > 0 && <small>重新检测可读取时长</small>
                          )}
                        </span>
                        <strong className="counted-units">
                          {recordUnits(record)}
                          <small>
                            {record.countMode === "duration"
                              ? `${record.unitSeconds || 30}s/个·四舍五入`
                              : "每文件计1"}
                          </small>
                        </strong>
                        <strong>{record.selected}</strong>
                        <strong>
                          {total
                            ? Math.round((record.selected / total) * 100)
                            : 0}
                          %
                        </strong>
                      </div>
                    );
                  })}
              </div>
            </div>
          </section>
        )}

        {panel === "permissions" && accessSession.kind === "admin" && (
          <section className="panel permissions-panel">
            <div className="admin-intro">
              <p className="eyebrow">管理员专属面板</p>
              <h2>指定谁是组长</h2>
              <p>
                管理员仍然拥有人员、打卡和实际产量的全部功能，这里只额外负责组长权限。
              </p>
            </div>
            <div className="leader-list">
              {people
                .filter((person) => person.status !== "archived")
                .map((person) => (
                  <article className="leader-row" key={person.id}>
                    <span
                      className="mini-avatar"
                      style={{ background: person.accent }}
                    >
                      {initials(person.name)}
                    </span>
                    <span className="leader-person">
                      <strong>{person.name}</strong>
                      <small>
                        {person.team} · {person.role}
                      </small>
                    </span>
                    <span
                      className={`leader-status ${
                        person.isLeader ? "active" : ""
                      }`}
                    >
                      {person.isLeader ? "当前组长" : "普通员工"}
                    </span>
                    <label className="leader-pin-field">
                      <span>{person.isLeader ? "重设 PIN" : "设置组长 PIN"}</span>
                      <SecretInput
                        inputMode="numeric"
                        minLength={4}
                        placeholder="至少4位"
                        value={leaderPinDrafts[person.id] ?? ""}
                        onChange={(event) =>
                          setLeaderPinDrafts((current) => ({
                            ...current,
                            [person.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <span className="leader-actions">
                      <button
                        className="primary"
                        type="button"
                        disabled={authBusy}
                        onClick={() => makeLeader(person)}
                      >
                        {person.isLeader ? "更新 PIN" : "设为组长"}
                      </button>
                      {person.isLeader && (
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => removeLeader(person)}
                        >
                          取消组长
                        </button>
                      )}
                    </span>
                  </article>
                ))}
            </div>
          </section>
        )}
      </main>

      {showPersonForm && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal person-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="person-form-title"
          >
            <button
              className="modal-close"
              onClick={() => setShowPersonForm(false)}
              aria-label="关闭"
            >
              ×
            </button>
            <p className="eyebrow">人员与定量</p>
            <h2 id="person-form-title">
              {editingPerson ? "编辑人员" : "新增人员"}
            </h2>
            <form onSubmit={savePerson}>
              <label>
                姓名
                <input
                  name="name"
                  defaultValue={editingPerson?.name}
                  maxLength={30}
                  required
                />
              </label>
              <label>
                岗位说明
                <input
                  name="role"
                  defaultValue={editingPerson?.role}
                  maxLength={40}
                  placeholder="例如：AI 视觉"
                />
              </label>
              <label>
                所属小组
                <input
                  name="team"
                  list="team-options"
                  defaultValue={
                    editingPerson?.team ??
                    (selectedTeam === "all" ? "AI组" : selectedTeam)
                  }
                  maxLength={30}
                  placeholder="例如：AI组"
                  required
                />
                <datalist id="team-options">
                  {teams.map((team) => (
                    <option key={team} value={team} />
                  ))}
                </datalist>
              </label>
              <fieldset>
                <legend>定量类型</legend>
                {(editingPerson?.categories ?? [
                  { name: "AI图", monthly: 100, daily: 5 },
                  { name: "", monthly: 0, daily: 0 },
                ]).map((category, index) => (
                  <div className="category-inputs" key={index}>
                    <input
                      aria-label={`类型${index + 1}`}
                      name="categoryName"
                      defaultValue={category.name}
                      placeholder="类型名称"
                    />
                    <input
                      aria-label={`类型${index + 1}日定量`}
                      name="categoryDaily"
                      type="number"
                      min="0"
                      defaultValue={category.daily}
                      placeholder="日定量"
                    />
                    <input
                      aria-label={`类型${index + 1}月定量`}
                      name="categoryMonthly"
                      type="number"
                      min="0"
                      defaultValue={category.monthly}
                      placeholder="月定量"
                    />
                    <select
                      aria-label={`类型${index + 1}计数规则`}
                      name="categoryCountMode"
                      defaultValue={normalizeCategory(category).countMode}
                    >
                      <option value="file">每个文件计1</option>
                      <option value="duration">按视频时长折算</option>
                    </select>
                    <input
                      aria-label={`类型${index + 1}每多少秒计1`}
                      name="categoryUnitSeconds"
                      type="number"
                      min="1"
                      defaultValue={normalizeCategory(category).unitSeconds}
                      placeholder="每N秒"
                      title="仅在选择按视频时长折算时生效"
                    />
                  </div>
                ))}
              </fieldset>
              <button
                className="primary full"
                type="submit"
                disabled={scanInProgress}
              >
                保存人员定量
              </button>
              {editingPerson && editingPerson.status !== "archived" && (
                <button
                  className="archive-person-button"
                  type="button"
                  onClick={() => archivePerson(editingPerson.id)}
                >
                  将该人员设为离组
                  <small>历史报数与云端检测记录会继续保留</small>
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {showArchivedPeople && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal archived-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="archived-people-title"
          >
            <button
              className="modal-close"
              onClick={() => setShowArchivedPeople(false)}
              aria-label="关闭"
            >
              ×
            </button>
            <p className="eyebrow">历史数据不会删除</p>
            <h2 id="archived-people-title">已离组人员</h2>
            <p className="modal-copy">
              离组人员不会参与当前定额、打卡和实际产量汇总，历史记录仍可按原人员识别。
            </p>
            <div className="archived-list">
              {archivedPeople.length === 0 ? (
                <div className="archived-empty">目前没有已离组人员</div>
              ) : (
                archivedPeople.map((person) => {
                  const reportCount = monthlyReported(person.id);
                  const driveCount = records.filter(
                    (record) => record.personId === person.id,
                  ).length;
                  return (
                    <div className="archived-person" key={person.id}>
                      <span
                        className="mini-avatar"
                        style={{ background: person.accent }}
                      >
                        {initials(person.name)}
                      </span>
                      <span>
                        <strong>{person.name}</strong>
                        <small>
                          {person.team} · 已保留报数 {reportCount} · 云端记录{" "}
                          {driveCount} 条
                        </small>
                      </span>
                      <span className="archived-actions">
                        <button
                          className="secondary"
                          type="button"
                          onClick={() => restorePerson(person.id)}
                        >
                          恢复
                        </button>
                        <button
                          className="delete-person-button"
                          type="button"
                          onClick={() => openDeleteConfirmation(person)}
                        >
                          删除
                        </button>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {deleteCandidate && (
        <div className="modal-backdrop delete-backdrop" role="presentation">
          <div
            className="modal delete-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
          >
            <span className="danger-mark">!</span>
            <p className="eyebrow">
              {deleteConfirmStep === 1 ? "第一次确认" : "第二次最终确认"}
            </p>
            <h2 id="delete-confirm-title">
              {deleteConfirmStep === 1
                ? `确认删除 ${deleteCandidate.name}？`
                : `最后确认：永久删除 ${deleteCandidate.name}`}
            </h2>
            <div className="delete-warning">
              {deleteConfirmStep === 1 ? (
                <>
                  该人员的历史报数、每日定额调整和所有云端检测记录都会被删除。
                  此操作无法恢复。
                </>
              ) : (
                <>
                  这是最后一步。点击“第二次确认：永久删除”后，所有关联数据会立即清除。
                </>
              )}
            </div>
            <div className="delete-data-summary">
              <span>
                历史报数 <strong>{monthlyReported(deleteCandidate.id)}</strong>
              </span>
              <span>
                云端记录{" "}
                <strong>
                  {
                    records.filter(
                      (record) => record.personId === deleteCandidate.id,
                    ).length
                  }
                </strong>
              </span>
            </div>
            <div className="delete-confirm-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  if (deleteConfirmStep === 2) {
                    setDeleteConfirmStep(1);
                  } else {
                    setDeleteCandidate(null);
                  }
                }}
              >
                {deleteConfirmStep === 2 ? "返回上一步" : "取消"}
              </button>
              {deleteConfirmStep === 1 ? (
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => setDeleteConfirmStep(2)}
                >
                  第一次确认：继续
                </button>
              ) : (
                <button
                  className="danger-button final"
                  type="button"
                  onClick={permanentlyDeletePerson}
                >
                  第二次确认：永久删除
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {editingDailyQuota && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal daily-quota-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="daily-quota-title"
          >
            <button
              className="modal-close"
              onClick={() => setEditingDailyQuota(null)}
              aria-label="关闭"
            >
              ×
            </button>
            <p className="eyebrow">仅调整选中的日期</p>
            <h2 id="daily-quota-title">
              {
                people.find(
                  (person) => person.id === editingDailyQuota.personId,
                )?.name
              }
              · {editingDailyQuota.date}
            </h2>
            <p className="modal-copy">
              可以修改当天数量或增加临时类型，不会影响其他日期。
            </p>
            <form onSubmit={saveDailyQuota}>
              <div className="daily-quota-labels">
                <span>制作类型</span>
                <span>当天定额</span>
                <span />
              </div>
              <div className="daily-quota-rows">
                {dailyQuotaDraft.map((category, index) => (
                  <div className="daily-quota-row" key={index}>
                    <input
                      aria-label={`当日类型${index + 1}`}
                      value={category.name}
                      placeholder="例如：常规口播"
                      onChange={(event) =>
                        updateDailyQuotaDraft(index, "name", event.target.value)
                      }
                    />
                    <input
                      aria-label={`${category.name || `类型${index + 1}`}当天定额`}
                      type="number"
                      min="0"
                      value={category.daily}
                      onChange={(event) =>
                        updateDailyQuotaDraft(index, "daily", event.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="remove-row"
                      aria-label={`删除${category.name || "该类型"}`}
                      onClick={() =>
                        setDailyQuotaDraft((current) =>
                          current.filter(
                            (_, categoryIndex) => categoryIndex !== index,
                          ),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="add-quota-row"
                onClick={() =>
                  setDailyQuotaDraft((current) => [
                    ...current,
                    { name: "", daily: 0, monthly: 0 },
                  ])
                }
              >
                ＋ 增加临时类型
              </button>
              <label className="default-checkbox">
                <input type="checkbox" name="useAsDefault" />
                <span>同时设为该人员今后的默认每日定额</span>
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={resetDailyQuota}
                  disabled={
                    !dailyQuotas[editingDailyQuota.date]?.[
                      editingDailyQuota.personId
                    ]
                  }
                >
                  恢复默认
                </button>
                <button className="primary" type="submit">
                  保存当天定额
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLinkForm && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="link-form-title"
          >
            <button
              className="modal-close"
              onClick={() => setShowLinkForm(false)}
              aria-label="关闭"
            >
              ×
            </button>
            <p className="eyebrow">今日实际产量</p>
            <h2 id="link-form-title">检测 Google Drive 文件夹</h2>
            <p className="modal-copy">
              每个链接单独统计，系统会递归识别子文件夹，并计算「已选用」文件夹中的数量。
            </p>
            <form onSubmit={scanFolder}>
              <label>
                选择人员
                <select
                  name="personId"
                  value={linkPerson?.id ?? ""}
                  onChange={(event) => setLinkPersonId(event.target.value)}
                  required
                >
                  {activePeople.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                本次上传的制作类型
                <select
                  key={linkPerson?.id}
                  name="categoryName"
                  required
                >
                  {linkPerson &&
                    categoriesForDate(linkPerson, todayKey).map((category) => (
                      <option key={category.name} value={category.name}>
                        {category.name} · {countRuleLabel(category)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Google Drive 文件夹链接
                <input
                  name="url"
                  type="url"
                  inputMode="url"
                  placeholder="https://drive.google.com/drive/folders/..."
                  required
                />
              </label>
              <div className="privacy-box">
                <strong>只读检测</strong>
                <span>不下载文件、不查看内容、不修改云端数据</span>
              </div>
              <button className="primary full" type="submit">
                {scanInProgress ? "正在检测…" : "开始检测"}
              </button>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
