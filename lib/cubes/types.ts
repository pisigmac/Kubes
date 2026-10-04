export type Cube = {
  id: string;
  slug: string;
  name: string;
  painPoint: string;
  instructions: string;
  model: string;
  isMaestro: boolean;
  seedKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Thread = {
  id: string;
  cubeId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type HandoffResult = {
  ok: boolean;
  cubeId: string;
  cubeName: string;
  slug: string;
  reply: string;
  activity?: string[];
  error?: string;
};

export type CubeMutationResult = {
  ok: boolean;
  cube?: Cube;
  error?: string;
};
