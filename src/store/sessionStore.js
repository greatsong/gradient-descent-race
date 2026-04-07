import { create } from 'zustand';

const useSessionStore = create((set) => ({
  sessionId: null,
  myTeam: null,
  teams: [],
  isTeacher: false,

  setSession: (sessionId) => set({ sessionId }),
  setMyTeam: (team) => set({ myTeam: team }),
  setTeams: (teams) => set({ teams }),
  setIsTeacher: (v) => set({ isTeacher: v }),

  updateTeam: (teamId, data) => set((state) => ({
    teams: state.teams.map(t => t.id === teamId ? { ...t, ...data } : t),
    myTeam: state.myTeam?.id === teamId ? { ...state.myTeam, ...data } : state.myTeam,
  })),

  reset: () => set({ sessionId: null, myTeam: null, teams: [], isTeacher: false }),
}));

export default useSessionStore;
