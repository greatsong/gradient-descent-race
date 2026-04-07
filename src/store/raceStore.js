import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useRaceStore = create(
  persist(
    (set) => ({
      // 영속 상태 (localStorage)
      myLearningRate: 0.1,
      myMomentum: 0.9,

      // 게임 흐름 상태
      phase: 'lobby', // lobby | ready_call | map_select | param_set | countdown | racing | results | final
      mapLevel: 1,
      teams: {},
      balls: {},
      results: [],
      myTeamId: null,

      // 레디 상태
      readyTeams: [],
      totalTeams: 0,

      // 라운드 시스템
      roundNumber: 0,
      roundResults: [],
      cumulativeStandings: [],

      // 카운트다운
      countdownSeconds: 0,

      // 솔로 모드
      soloMode: false,
      soloBalls: {},
      soloMapLevel: 1,

      // 액션
      setMyLearningRate: (v) => set({ myLearningRate: v }),
      setMyMomentum: (v) => set({ myMomentum: v }),
      setPhase: (phase) => set({ phase }),
      setMapLevel: (level) => set({ mapLevel: level }),
      setTeams: (teams) => set({ teams }),
      updateBalls: (balls) => set({ balls }),
      setResults: (results) => set({ results }),
      setMyTeamId: (id) => set({ myTeamId: id }),
      setReadyTeams: (readyTeams) => set({ readyTeams }),
      setTotalTeams: (totalTeams) => set({ totalTeams }),
      setRoundNumber: (roundNumber) => set({ roundNumber }),
      setRoundResults: (roundResults) => set({ roundResults }),
      setCumulativeStandings: (cumulativeStandings) => set({ cumulativeStandings }),
      setCountdownSeconds: (countdownSeconds) => set({ countdownSeconds }),
      setSoloMode: (soloMode) => set({ soloMode }),
      setSoloBalls: (soloBalls) => set({ soloBalls }),
      setSoloMapLevel: (level) => set({ soloMapLevel: level }),

      reset: () => set({
        phase: 'lobby',
        teams: {},
        balls: {},
        results: [],
        readyTeams: [],
        totalTeams: 0,
        roundNumber: 0,
        roundResults: [],
        cumulativeStandings: [],
        countdownSeconds: 0,
        soloMode: false,
        soloBalls: {},
      }),
    }),
    {
      name: 'gd-race-params',
      partialize: (state) => ({
        myLearningRate: state.myLearningRate,
        myMomentum: state.myMomentum,
      }),
    }
  )
);

export default useRaceStore;
