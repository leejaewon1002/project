const bcrypt = require("bcryptjs");
const { getSupabaseClient, isSupabaseConfigured, isMongoConfigured } = require("../config/db");
let UserModel = null;
if (isMongoConfigured()) {
  try {
    // lazy require to avoid circular dependency before mongoose connects
    UserModel = require("../models/User");
  } catch (e) {
    UserModel = null;
  }
}
const fs = require("fs");
const path = require("path");
const FILE_STORE = path.join(__dirname, "..", "..", "data", "users.json");

// Ensure data directory exists
try {
  const dataDir = path.dirname(FILE_STORE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(FILE_STORE)) fs.writeFileSync(FILE_STORE, "[]", "utf8");
} catch (e) {
  // ignore
}

const loadFileUsers = () => {
  try {
    const raw = fs.readFileSync(FILE_STORE, "utf8");
    return JSON.parse(raw || "[]");
  } catch (e) {
    return [];
  }
};

const saveFileUsers = (arr) => {
  fs.writeFileSync(FILE_STORE, JSON.stringify(arr, null, 2), "utf8");
};

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
  // Prefer local storage first so locally created accounts resolve even when Supabase is misconfigured.
  const localUsers = loadFileUsers();
  const localUser = localUsers.find((x) => x.id === userId || x.username === userId);
  if (localUser) {
    return normalizeUser(localUser);
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = requireSupabase();
      const { data, error } = await supabase.from(USERS_TABLE).select("*").eq("id", userId).maybeSingle();

      if (!error && data) {
        return normalizeUser(data);
      }

      if (error) {
        console.error('Supabase getUserById failed, falling back to local store:', error && error.message ? error.message : error);
      }
    } catch (e) {
      console.error('Supabase getUserById error, falling back to local store:', e && e.message ? e.message : e);
    }
  }

  // Mongo fallback
  if (UserModel) {
    const doc = await UserModel.findOne({ id: userId }).lean();
    return normalizeUser(doc ? {
      id: doc.id,
      username: doc.id,
      email: doc.email,
      name: doc.name,
      avatar: doc.avatar,
      login_type: doc.loginType,
      last_login: doc.lastLogin,
      settings: doc.settings,
      ingredients: doc.ingredients,
      shopping: doc.shopping
    } : null);
  }

  return null;
};

const findUserByLogin = async (identifier) => {
  const normalizedIdentifier = String(identifier || "").trim();
  if (!normalizedIdentifier) return null;

  if (isSupabaseConfigured()) {
    try {
      const supabase = requireSupabase();

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
    } catch (e) {
      console.error('Supabase lookup failed, falling back to local store:', e && e.message ? e.message : e);
      // fall through to local/mongo/file fallback
    }
  }

  // Mongo fallback
  if (UserModel) {
    let doc = await UserModel.findOne({ id: normalizedIdentifier }).lean();
    if (!doc) doc = await UserModel.findOne({ email: normalizedIdentifier.toLowerCase() }).lean();
    return doc || null;
  }

  // File fallback
  const users = loadFileUsers();
  let u = users.find((x) => x.username === normalizedIdentifier);
  if (!u) u = users.find((x) => x.email === normalizedIdentifier.toLowerCase());
  return u || null;
};

const createUser = async ({ username, email, password, name }) => {
  const passwordHash = await bcrypt.hash(password, 10);

  if (isSupabaseConfigured()) {
    try {
      const supabase = requireSupabase();

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
      if (!error && data) return normalizeUser(data);
      // if supabase error, fall through to fallback storage
      console.error('Supabase insert failed, falling back to local store:', error || 'no data');
    } catch (e) {
      console.error('Supabase createUser error, falling back to local store:', e && e.message ? e.message : e);
    }
  }

  // Mongo fallback
  if (UserModel) {
    const u = new UserModel({
      id: String(username || "").trim(),
      email: String(email || "").trim().toLowerCase(),
      password: passwordHash,
      name: name || String(username || "").trim(),
      avatar: "",
      loginType: "password",
      lastLogin: new Date(),
      settings: defaultSettings(),
      ingredients: [],
      shopping: []
    });
    await u.save();
    return normalizeUser({
      id: u.id,
      username: u.id,
      email: u.email,
      name: u.name,
      avatar: u.avatar,
      login_type: u.loginType,
      last_login: u.lastLogin,
      settings: u.settings,
      ingredients: u.ingredients,
      shopping: u.shopping
    });
  }
  // File fallback: save to JSON file
  const users = loadFileUsers();
  const id = String(username || "").trim();
  if (users.find((x) => x.username === id || x.email === String(email || "").trim().toLowerCase())) {
    const err = new Error("이미 존재하는 사용자입니다.");
    err.code = "DUPLICATE";
    throw err;
  }
  const newUser = {
    id,
    username: id,
    email: String(email || "").trim().toLowerCase(),
    password: passwordHash,
    name: name || id,
    avatar: "",
    loginType: "password",
    lastLogin: new Date().toISOString(),
    settings: defaultSettings(),
    ingredients: [],
    shopping: []
  };
  users.push(newUser);
  saveFileUsers(users);
  return normalizeUser(newUser);
};

const authenticateUser = async ({ identifier, password }) => {
  const row = await findUserByLogin(identifier);
  if (!row) return null;

  if (isSupabaseConfigured()) {
    try {
      const isPasswordValid = await bcrypt.compare(password, row.password_hash || "");
      if (!isPasswordValid) return null;

      const supabase = requireSupabase();
      const { data, error } = await supabase
        .from(USERS_TABLE)
        .update({ last_login: new Date().toISOString() })
        .eq("id", row.id)
        .select("*")
        .single();

      if (!error && data) return normalizeUser(data);
      console.error('Supabase authenticate/update failed, falling back to local store:', error || 'no data');
    } catch (e) {
      console.error('Supabase authenticate error, falling back to local store:', e && e.message ? e.message : e);
    }
  }

  // Mongo fallback: row is a doc
  if (UserModel) {
    const isPasswordValid = await bcrypt.compare(password, row.password || "");
    if (!isPasswordValid) return null;

    // update lastLogin
    await UserModel.updateOne({ id: row.id }, { lastLogin: new Date() });
    const doc = await UserModel.findOne({ id: row.id }).lean();
    return normalizeUser({
      id: doc.id,
      username: doc.id,
      email: doc.email,
      name: doc.name,
      avatar: doc.avatar,
      login_type: doc.loginType,
      last_login: doc.lastLogin,
      settings: doc.settings,
      ingredients: doc.ingredients,
      shopping: doc.shopping
    });
  }

  // File fallback
  const users = loadFileUsers();
  const u = users.find((x) => x.username === (identifier) || x.email === (identifier || "").toLowerCase());
  if (!u) return null;
  const isPasswordValid = await bcrypt.compare(password, u.password || "");
  if (!isPasswordValid) return null;
  // update lastLogin
  u.lastLogin = new Date().toISOString();
  saveFileUsers(users);
  return normalizeUser(u);
};

const updateUser = async (userId, updates) => {
  const localUsers = loadFileUsers();
  const localIndex = localUsers.findIndex((x) => x.id === userId || x.username === userId);
  if (localIndex !== -1) {
    const u = localUsers[localIndex];
    u.name = updates.name !== undefined ? updates.name : u.name;
    u.avatar = updates.avatar !== undefined ? updates.avatar : u.avatar;
    u.settings = updates.settings || u.settings;
    u.ingredients = updates.ingredients || u.ingredients;
    u.shopping = updates.shopping || u.shopping;
    u.lastLogin = updates.lastLogin || u.lastLogin;
    saveFileUsers(localUsers);
    return normalizeUser(u);
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = requireSupabase();
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
      if (!error && data) {
        return normalizeUser(data);
      }

      if (error) {
        console.error('Supabase updateUser failed, falling back to local store:', error && error.message ? error.message : error);
      }
    } catch (e) {
      console.error('Supabase updateUser error, falling back to local store:', e && e.message ? e.message : e);
    }
  }

  // Mongo fallback
  if (UserModel) {
    const doc = await UserModel.findOne({ id: userId });
    if (!doc) return null;
    doc.name = updates.name !== undefined ? updates.name : doc.name;
    doc.avatar = updates.avatar !== undefined ? updates.avatar : doc.avatar;
    doc.settings = updates.settings || doc.settings;
    doc.ingredients = updates.ingredients || doc.ingredients;
    doc.shopping = updates.shopping || doc.shopping;
    doc.lastLogin = updates.lastLogin || doc.lastLogin;
    await doc.save();
    return normalizeUser({
      id: doc.id,
      username: doc.id,
      email: doc.email,
      name: doc.name,
      avatar: doc.avatar,
      login_type: doc.loginType,
      last_login: doc.lastLogin,
      settings: doc.settings,
      ingredients: doc.ingredients,
      shopping: doc.shopping
    });
  }

  return null;
};

const appendEntry = async (userId, fieldName, value) => {
  const current = await getUserById(userId);
  if (!current) return null;

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

const deleteUser = async (userId) => {
  // Local file store
  const localUsers = loadFileUsers();
  const idx = localUsers.findIndex((x) => x.id === userId || x.username === userId);
  if (idx !== -1) {
    localUsers.splice(idx, 1);
    saveFileUsers(localUsers);
    return true;
  }

  // Supabase
  if (isSupabaseConfigured()) {
    try {
      const supabase = requireSupabase();
      const { error } = await supabase.from(USERS_TABLE).delete().eq("id", userId);
      if (!error) return true;
      console.error('Supabase deleteUser failed, falling back to other stores:', error && error.message ? error.message : error);
    } catch (e) {
      console.error('Supabase deleteUser error, falling back to other stores:', e && e.message ? e.message : e);
    }
  }

  // Mongo
  if (UserModel) {
    try {
      const res = await UserModel.deleteOne({ id: userId });
      return res.deletedCount > 0;
    } catch (e) {
      console.error('Mongo deleteUser error:', e && e.message ? e.message : e);
    }
  }

  return false;
};

// Local-file-only helpers (force using JSON file store)
const createUserLocal = async ({ username, email, password, name }) => {
  const passwordHash = await bcrypt.hash(password, 10);
  const users = loadFileUsers();
  const id = String(username || "").trim();
  if (users.find((x) => x.username === id || x.email === String(email || "").trim().toLowerCase())) {
    const err = new Error("이미 존재하는 사용자입니다.");
    err.code = "DUPLICATE";
    throw err;
  }
  const newUser = {
    id,
    username: id,
    email: String(email || "").trim().toLowerCase(),
    password: passwordHash,
    name: name || id,
    avatar: "",
    loginType: "password",
    lastLogin: new Date().toISOString(),
    settings: defaultSettings(),
    ingredients: [],
    shopping: []
  };
  users.push(newUser);
  saveFileUsers(users);
  return normalizeUser(newUser);
};

const authenticateUserLocal = async ({ identifier, password }) => {
  const users = loadFileUsers();
  const id = String(identifier || "").trim();
  let u = users.find((x) => x.username === id);
  if (!u) u = users.find((x) => x.email === id.toLowerCase());
  if (!u) return null;
  const isPasswordValid = await bcrypt.compare(password, u.password || "");
  if (!isPasswordValid) return null;
  u.lastLogin = new Date().toISOString();
  saveFileUsers(users);
  return normalizeUser(u);
};

const findUserLocal = async (identifier) => {
  const users = loadFileUsers();
  const id = String(identifier || "").trim();
  if (!id) return null;
  return users.find((x) => x.username === id || x.email === id.toLowerCase()) || null;
};

module.exports = {
  isSupabaseConfigured,
  isStorageReady: () => {
    // storage is ready if supabase is configured, mongo is configured, or file store exists
    const fileExists = fs.existsSync(FILE_STORE);
    return isSupabaseConfigured() || isMongoConfigured() || fileExists;
  },
  getUserById,
  findUserByLogin,
  createUser,
  authenticateUser,
  createUserLocal,
  authenticateUserLocal,
  findUserLocal,
  updateUser,
  appendEntry,
  deleteUser,
  normalizeUser,
  defaultSettings
};