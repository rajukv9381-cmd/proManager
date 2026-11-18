import { api } from '../../api.js';

export const projectsKey = userId => ['projects', userId];

export function projectsQueryOptions(userId) {
  return {
    queryKey: projectsKey(userId),
    queryFn: ({ signal }) => api('/api/projects', { signal }),
    enabled: Boolean(userId),
    retry: false
  };
}
