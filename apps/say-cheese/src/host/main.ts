// TV entry (index.html, SPEC §4, §6.6). SC0 stub: the wordmark on the brand background; host wiring
// (SC5) mounts the match views into #tv.
import '../styles/brand.css';
import '../styles/base.css';

const tv = document.getElementById('tv') ?? document.body;
const lockup = document.createElement('h1');
lockup.className = 'lockup title';
lockup.setAttribute('aria-label', 'Say Cheese!');
const say = document.createElement('span');
say.className = 'say';
say.textContent = 'Say';
const cheese = document.createElement('span');
cheese.className = 'cheese';
cheese.textContent = 'Cheese!';
lockup.append(say, cheese);
tv.replaceChildren(lockup);
