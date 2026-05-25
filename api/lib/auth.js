const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const USERS_TABLE = process.env.SUPABASE_USERS_TABLE || "users";
const JWT_SECRET = process.env.JWT_SECRET || "your_super_secret_key_change_in_production_12345";
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

let supabaseClient = null;

const isSupabaseConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const ensureSupabase = () => {
  if (!isSupabaseConfigured()) {
    const error = new Error("Supabase가 초기화되지 않았습니다.");
    error.statusCode = 503;
    throw error;
  }

  if (!supabaseClient) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }

  return supabaseClient;
};

const defaultSettings = () => ({
  monthlyBudget: 50000,
  preferredCategories: [],
  preferredDietary: []
});

const normalizeList = (value) => (Array.isArray(value) ? value : []);

const normalizeUser = (row) => {
  if (!row) return null;

  return {
    databaseId: row.id,
    id: row.username,
    email: row.email,
    name: row.name || "",
    avatar: row.avatar || "",
    loginType: row.login_type || "password",
    lastLogin: row.last_login || new Date().toISOString(),
    settings: row.settings || defaultSettings(),
    ingredients: normalizeList(row.ingredients),
    shopping: normalizeList(row.shopping)
  };
};

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  const derivedKey = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256").toString("hex");
  return `pbkdf2$sha256$${iterations}$${salt}$${derivedKey}`;
};

const verifyPassword = (password, storedHash) => {
  if (!storedHash || typeof storedHash !== "string") return false;
  const parts = storedHash.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") return false;
  const iterations = Number(parts[2]);
  const salt = parts[3];
  const expectedHash = parts[4];
  const derivedKey = crypto.pbkdf2Sync(String(password), salt, iterations, 32, "sha256");
  const expectedBuffer = Buffer.from(expectedHash, "hex");
  if (expectedBuffer.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, derivedKey);
};

const base64UrlEncode = (value) => Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const base64UrlDecode = (value) => {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
};

const signToken = ({ userId, email }) => {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      userId,
      email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
    })
  );
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
};

const verifyToken = (token) => {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expectedSignature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const decoded = JSON.parse(base64UrlDecode(payload));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch (error) {
    return null;
  }
};

const getTokenFromRequest = (req) => {
  const header = req.headers.authorization || req.headers.Authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
};

const requireAuth = (req) => verifyToken(getTokenFromRequest(req));

const findUserByLogin = async (identifier) => {
  const normalizedIdentifier = String(identifier || "").trim();
  if (!normalizedIdentifier) return null;
  const supabase = ensureSupabase();

  const { data: byUsername, error: usernameError } = await supabase
    .from(USERS_TABLE)
    .select("*")
    .eq("username", normalizedIdentifier)
    .maybeSingle();
  if (usernameError) throw usernameError;
  if (byUsername) return byUsername;

  const { data: byEmail, error: emailError } = await supabase
    .from(USERS_TABLE)
    .select("*")
    .eq("email", normalizedIdentifier.toLowerCase())
    .maybeSingle();
  if (emailError) throw emailError;
  return byEmail;
};

const createUser = async ({ username, email, password, name }) => {
  const supabase = ensureSupabase();
  const payload = {
    username: String(username || "").trim(),
    email: String(email || "").trim().toLowerCase(),
    password_hash: hashPassword(password),
    name: name || String(username || "").trim(),
    avatar: "",
    login_type: "password",
    last_login: new Date().toISOString(),
    settings: defaultSettings(),
    ingredients: [],
    shopping: []
  };

  const { data, error } = await supabase.from(USERS_TABLE).insert(payload).select("*").single();
  if (error) throw error;
  return normalizeUser(data);
};

const authenticateUser = async ({ identifier, password }) => {
  const row = await findUserByLogin(identifier);
  if (!row) return null;
  if (!verifyPassword(password, row.password_hash || "")) return null;

  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from(USERS_TABLE)
    .update({ last_login: new Date().toISOString() })
    .eq("id", row.id)
    .select("*")
    .single();
  if (error) throw error;
  return normalizeUser(data || row);
};

const getUserById = async (userId) => {
  const supabase = ensureSupabase();
  const { data, error } = await supabase.from(USERS_TABLE).select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return normalizeUser(data);
};

const updateUser = async (userId, updates) => {
  const supabase = ensureSupabase();
  const current = await getUserById(userId);
  if (!current) return null;

  const payload = {
    name: updates.name !== undefined ? updates.name : current.name,
    avatar: updates.avatar !== undefined ? updates.avatar : current.avatar,
    settings: updates.settings || current.settings,
    ingredients: updates.ingredients || current.ingredients,
    shopping: updates.shopping || current.shopping,
    last_login: updates.lastLogin || current.lastLogin
  };

  const { data, error } = await supabase.from(USERS_TABLE).update(payload).eq("id", userId).select("*").single();
  if (error) throw error;
  return normalizeUser(data);
};

module.exports = {
  isSupabaseConfigured,
  ensureSupabase,
  normalizeUser,
  signToken,
  verifyToken,
  requireAuth,
  findUserByLogin,
  createUser,
  authenticateUser,
  getUserById,
  updateUser
};