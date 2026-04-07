import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useRaceStore = create(
  persist(
    (set) => ({
      // 영속 상태 (localStorage)
      myLearningRate: 0.1,
      myMomentum: 0.9,

      // 실시간 상태
      racePhase: 'setup', // setup | preparing | racing | stageResult | finished
      mapLevel: 1,
      teams: {},
      balls: {},
      results: [],
      myTeamId: null,
      raceMode: 'competition', // solo | competition

      // GP 상태
      gpActive: false,
      gpStage: 0,
      stageResults: [[], [], []],
      gpFinalResults: [],
      gpCountdown: 0,
      racePaused: false,

      // 액션
      setMyLearningRate: (v) => set({ myLearningRate: v }),
      setMyMomentum: (v) => set({ myMomentum: v }),
      setRacePhase: (phase) => set({ racePhase: phase }),
      setMapLevel: (level) => set({ mapLevel: level }),
      setTeams: (teams) => set({ teams }),
      updateBalls: (balls) => set({ balls }),
      setResults: (results) => set({ results }),
      setMyTeamId: (id) => set({ myTeamId: id }),
      setRaceMode: (mode) => set({ raceMode: mode }),

      setGpActive: (v) => set({ gpActive: v }),
      setGpStage: (stage) => set({ gpStage: stage }),
      setGpCountdown: (v) => set({ gpCountdown: v }),
      setRacePaused: (v) => set({ racePaused: v }),
      addStageResult: (stageIdx, result) => set((state) => {
        const newStageResults = [...state.stageResults];
        newStageResults[stageIdx] = result;
        return { stageResults: newStageResults };
      }),
      setGpFinalResults: (results) => set({ gpFinalResults: results }),

      reset: () => set({
        racePhase: 'setup',
        teams: {},
        balls: {},
        results: [],
        gpActive: false,
        gpStage: 0,
        stageResults: [[], [], []],
        gpFinalResults: [],
        gpCountdown: 0,
        racePaused: false,
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
