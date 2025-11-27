import { configureStore } from '@reduxjs/toolkit';
import marketReducer from './slices/marketSlice';
import themeReducer from './slices/themeSlice';
import portfolioReducer from './slices/portfolioSlice';

export const store = configureStore({
  reducer: {
    market: marketReducer,
    theme: themeReducer,
    portfolio: portfolioReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
