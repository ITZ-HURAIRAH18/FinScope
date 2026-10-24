import { createSlice, PayloadAction } from '@reduxjs/toolkit';

/**
 * Theme state (audit line: "light theme is dead code — no toggle anywhere;
 * theme reducers mutate the DOM (impure) and don't persist").
 *
 * - Reducers are now PURE: they only update state. DOM application and
 *   localStorage persistence live in `components/ThemeSync.tsx`, which runs
 *   as an effect (reducer purity matters for RTK serializability checks and
 *   devtools time-travel).
 * - Initial state is 'dark' on BOTH server and client to avoid a hydration
 *   mismatch; ThemeSync reads the persisted preference right after mount.
 */
interface ThemeState {
  mode: 'dark' | 'light';
}

const initialState: ThemeState = {
  mode: 'dark',
};

export const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    toggleTheme: (state) => {
      state.mode = state.mode === 'dark' ? 'light' : 'dark';
    },
    setTheme: (state, action: PayloadAction<'dark' | 'light'>) => {
      state.mode = action.payload;
    },
  },
});

export const { toggleTheme, setTheme } = themeSlice.actions;
export default themeSlice.reducer;

/** localStorage key for the persisted theme. */
export const THEME_STORAGE_KEY = 'finscope-theme';
