// Compatibility re-export (SPEC §12.2): the title / lobby moved to ui/ at TF6. main.ts (not TF6's file)
// still imports `./lobby`; TF7 / TF12 rewire it to `createTvUi` and delete this file.
export { createLobby, type Lobby, type LobbyView } from './ui/lobby';
