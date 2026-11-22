import './ui/styles.css';
import { initPhysics } from './physics/PhysicsWorld';
import { Game } from './core/Game';

declare global {
  interface Window { __game?: Game }
}

async function boot() {
  const loading = document.getElementById('loading')!;
  const text = document.getElementById('loading-text')!;
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) throw new Error('webgl');
    text.textContent = 'LOADING PHYSICS…';
    await initPhysics();
    text.textContent = 'BUILDING WORLD…';
    await new Promise((r) => setTimeout(r, 30));
    window.__game = new Game(canvas);
    loading.classList.add('hidden');
  } catch (e) {
    console.error(e);
    loading.classList.add('hidden');
    document.getElementById('webgl-error')!.classList.remove('hidden');
  }
}
void boot();
