import { configureStore } from '@reduxjs/toolkit';
import projectReducer from './features/projects/projectSlice.js';

export const store = configureStore({
  reducer: { project: projectReducer }
});
