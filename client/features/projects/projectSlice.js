import { createSlice } from '@reduxjs/toolkit';

const projectSlice = createSlice({
  name: 'project',
  initialState: { selectedId: null },
  reducers: {
    selectProject(state, action) {
      state.selectedId = action.payload;
    }
  }
});

export const { selectProject } = projectSlice.actions;
export default projectSlice.reducer;
