"use client";

import { create } from "zustand";
import type { ActivityItem } from "@/types/events";

interface ActivityState {
  activities: ActivityItem[];
  addActivity: (item: ActivityItem) => void;
  clearActivities: () => void;
}

export const useActivityStore = create<ActivityState>((set) => ({
  activities: [],

  addActivity: (item) =>
    set((state) => ({
      activities: [item, ...state.activities],
    })),

  clearActivities: () => set({ activities: [] }),
}));
