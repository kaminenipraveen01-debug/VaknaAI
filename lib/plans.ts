export const PLAN_LIMITS = {
  guest:   { chats: 10,       images: 5,        privateChats: 0  },
  free:    { chats: 50,       images: 10,       privateChats: 5  },
  premium: { chats: Infinity, images: Infinity, privateChats: Infinity },
};

export function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}