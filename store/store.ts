import { configureStore } from '@reduxjs/toolkit';
import themeReducer from './slices/themeSlice';
import marketReducer from './slices/marketSlice';

export const store = configureStore({
  reducer: {
    theme: themeReducer,
    market: marketReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
