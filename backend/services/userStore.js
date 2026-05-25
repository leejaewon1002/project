const bcrypt = require("bcryptjs");
const { getSupabaseClient, isSupabaseConfigured } = require("../config/db");

const USERS_TABLE = process.env.SUPABASE_USERS_TABLE || "users";

const defaultSettings = () => ({
  monthlyBudget: 50000,
  preferredCategories: [],
  preferredDietary: []
});

const normalizeList = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  return [];
};

const normalizeUser = (row) => {
  if (!row) {
    return null;
  }

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

const requireSupabase = () => {
  const client = getSupabaseClient();

  if (!client || !isSupabaseConfigured()) {
    throw new Error("Supabase가 초기화되지 않았습니다.");
  }

  return client;
};

const getUserById = async (userId) => {
  const supabase = requireSupabase();
  const { data, error } = await supabase.from(USERS_TABLE).select("*").eq("id", userId).maybeSingle();

  if (error) {
    throw error;
  }

  return normalizeUser(data);
};

const findUserByLogin = async (identifier) => {
  const supabase = requireSupabase();
  const normalizedIdentifier = String(identifier || "").trim();

  if (!normalizedIdentifier) {
    return null;
  }

  const { data: byUsername, error: usernameError } = await supabase
    .from(USERS_TABLE)
    .select("*")
    .eq("username", normalizedIdentifier)
    .maybeSingle();

  if (usernameError) {
    throw usernameError;
  }

  if (byUsername) {
    return byUsername;
  }

  const { data: byEmail, error: emailError } = await supabase
    .from(USERS_TABLE)
    .select("*")
    .eq("email", normalizedIdentifier.toLowerCase())
    .maybeSingle();

  if (emailError) {
    throw emailError;
  }

  return byEmail;
};

const createUser = async ({ username, email, password, name }) => {
  const supabase = requireSupabase();
  const passwordHash = await bcrypt.hash(password, 10);

  const payload = {
    username: String(username || "").trim(),
    email: String(email || "").trim().toLowerCase(),
    password_hash: passwordHash,
    name: name || String(username || "").trim(),
    avatar: "",
    login_type: "password",
    last_login: new Date().toISOString(),
    settings: defaultSettings(),
    ingredients: [],
    shopping: []
  };

  const { data, error } = await supabase.from(USERS_TABLE).insert(payload).select("*").single();

  if (error) {
    throw error;
  }

  return normalizeUser(data);
};

const authenticateUser = async ({ identifier, password }) => {
  const supabase = requireSupabase();
  const row = await findUserByLogin(identifier);

  if (!row) {
    return null;
  }

  const isPasswordValid = await bcrypt.compare(password, row.password_hash || "");
  if (!isPasswordValid) {
    return null;
  }

  const { data, error } = await supabase
    .from(USERS_TABLE)
    .update({ last_login: new Date().toISOString() })
    .eq("id", row.id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return normalizeUser(data);
};

const updateUser = async (userId, updates) => {
  const supabase = requireSupabase();
  const current = await getUserById(userId);

  if (!current) {
    return null;
  }

  const payload = {
    name: updates.name !== undefined ? updates.name : current.name,
    avatar: updates.avatar !== undefined ? updates.avatar : current.avatar,
    settings: updates.settings || current.settings,
    ingredients: updates.ingredients || current.ingredients,
    shopping: updates.shopping || current.shopping,
    last_login: updates.lastLogin || current.lastLogin
  };

  const { data, error } = await supabase.from(USERS_TABLE).update(payload).eq("id", userId).select("*").single();

  if (error) {
    throw error;
  }

  return normalizeUser(data);
};

const appendEntry = async (userId, fieldName, value) => {
  const current = await getUserById(userId);

  if (!current) {
    return null;
  }

  const nextItems = [
    {
      name: value,
      addedAt: new Date().toISOString()
    },
    ...normalizeList(current[fieldName])
  ];

  const updates = {};
  updates[fieldName] = nextItems;

  return updateUser(userId, updates);
};

module.exports = {
  isSupabaseConfigured,
  getUserById,
  findUserByLogin,
  createUser,
  authenticateUser,
  updateUser,
  appendEntry,
  normalizeUser,
  defaultSettings
};