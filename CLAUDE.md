# Working

Writeup what you built with screenshots in the relevant GitHub issue.
Write any documentation you feel needed in the issue, not the repo.
Do not deploy to vercel.
Commit and push to main often, maintaining linear history.

# Builds, Platform and Testing

Use headless chromium when testing on this mac. Only test on the iPad when necessary due to
the additional build time overhead.
Platform is WebGPU. No WebGL path, no fallbacks, no quality setting, no older devices.
Target device is M1 iPad at 30 FPS.

# The Game World and UI

No humans, and no sign that people ever lived here.
Textures and recorded sounds come from ambient CG or Poly Haven with all geometry generated in code.
As few words as possible in the UI.
Numbers are permitted as needed.
The UI has the drawn asthetic of a sixteenth-century map.
No scripted events.
No music anywhere.
