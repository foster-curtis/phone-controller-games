// Phone entry (play.html, SPEC §4, §6.7). SC0 stub: the game name on the brand background; the
// controller app (SC3) and its wiring (SC5) mount into #app. Never imports host code (lint).
import '../styles/brand.css';
import '../styles/base.css';

const app = document.getElementById('app') ?? document.body;
const title = document.createElement('h1');
title.className = 'h2';
title.textContent = 'Say Cheese!';
app.replaceChildren(title);
