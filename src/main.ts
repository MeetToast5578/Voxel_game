import './style.css';
import { installDebugApi } from './debugApi';
import { Game } from './game';
import { readOptions } from './options';

const container = document.getElementById('app');
if (!container) throw new Error('#app element missing from index.html');

const game = new Game(container, readOptions(window.location.search));
installDebugApi(game);
game.start();
