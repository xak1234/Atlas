# ATLAS Screensaver - User Guide

## Quick Start

The ATLAS Tracker now includes a **fully functional screensaver mode** that transforms the application into an immersive fullscreen asteroid game experience.

### Activating the Screensaver

#### Option 1: Manual Toggle (Recommended)
1. Look for the **⚙️ settings button** in the top-left corner of the screen
2. Click it to enter screensaver mode
3. The button changes to **✕** when screensaver is active

#### Option 2: Automatic Idle Detection
- The screensaver **automatically activates** after **5 minutes** of inactivity
- Inactivity is detected when there's no:
  - Mouse movement
  - Keyboard input
  - Scrolling
  - Touch input

### Exiting the Screensaver

You have **4 ways** to exit screensaver mode:

#### 1. Press ESC Key (Fastest)
Simply press the **Escape** key on your keyboard

#### 2. Move Your Mouse
Move your mouse anywhere on the screen (except over the UI elements)

#### 3. Click Anywhere
Click anywhere on the screen to exit
- *Note: Clicking the settings button (✕) toggles the mode instead of exiting*

#### 4. Touch Screen (Mobile)
On touch devices, any touch input exits screensaver mode

## Screensaver Display

When screensaver mode is active, you'll see:

### Top Bar
- **Title**: "ATLAS SCREENSAVER" in bright green
- **Live Statistics**: 
  - Number of active asteroids
  - Number of UFOs
  - Number of bullets fired

### Main Area
- **Fullscreen asteroid game** with:
  - Autonomous AI-controlled spaceship
  - Randomly spawning asteroids
  - UFO encounters
  - Particle effects and explosions
  - Hyperspace jumps

### Bottom Bar
- **Exit Instructions**: "Press ESC or move mouse to exit • Double-click to toggle"
- Helps users understand how to exit

## Game Features in Screensaver Mode

### The Spaceship
- **Autonomous AI** that hunts asteroids
- **Automatic targeting** system
- **Smooth rotation** toward targets
- **Firing system** that activates when locked on

### Asteroids
- **Small asteroids** (15-35px) spawn continuously
- **Large asteroids** (80-120px) spawn every ~14 seconds
- **Collision detection** with the ship
- **Splitting behavior** when hit by bullets

### UFOs
- **Alien spacecraft** that appear randomly
- **Targeting system** that fires at the ship
- **Evasion mechanics** - ship uses hyperspace to escape

### Special Effects
- **Particle explosions** when asteroids are destroyed
- **Hyperspace jumps** with visual effects
- **Glowing effects** on UFOs and bullets
- **Smooth animations** throughout

## Customization

### Change Idle Timeout

To modify when the screensaver auto-activates:

1. Open `index.html` in a text editor
2. Find this line (around line 1560):
   ```javascript
   const IDLE_TIMEOUT = 300000; // 5 minutes of inactivity
   ```
3. Change the value (in milliseconds):
   - `120000` = 2 minutes
   - `180000` = 3 minutes
   - `300000` = 5 minutes (default)
   - `600000` = 10 minutes
   - `900000` = 15 minutes

### Disable Auto-Activation

To prevent automatic screensaver activation:

1. Find the `resetIdleTimer()` function (around line 1580)
2. Comment out or remove the timeout logic
3. Users can still manually activate via the button

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **ESC** | Exit screensaver mode |
| **Double-Click** | Toggle screensaver mode (when not in screensaver) |

## Mouse Controls

| Action | Result |
|--------|--------|
| **Click ⚙️ button** | Toggle screensaver mode |
| **Move mouse** | Exit screensaver (if active) |
| **Click anywhere** | Exit screensaver (if active) |

## Touch Controls

| Action | Result |
|--------|--------|
| **Tap ⚙️ button** | Toggle screensaver mode |
| **Any touch** | Exit screensaver (if active) |

## Troubleshooting

### Screensaver Won't Activate Automatically
- Check that you haven't moved your mouse or pressed keys for 5 minutes
- Verify the idle timeout setting is correct
- Try manually clicking the ⚙️ button instead

### Can't Exit Screensaver
- Press the **ESC** key
- Move your mouse to the edge of the screen
- Click anywhere on the screen
- On mobile, tap the screen

### Button Not Visible in Screensaver
- The ⚙️ button is hidden by default in screensaver mode
- **Hover over the top-left corner** to reveal it
- Or press **ESC** to exit

### Game Performance Issues
- The screensaver runs at 60 FPS
- If you experience lag, try closing other applications
- Check your browser's hardware acceleration settings

## Technical Details

### Performance
- **Frame Rate**: 60 FPS (via requestAnimationFrame)
- **Memory**: Minimal overhead, uses existing game engine
- **CPU**: Optimized for smooth animation
- **Network**: No network requests during screensaver

### Browser Compatibility
- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support
- **Mobile Browsers**: Full support with touch controls

### Data Privacy
- Screensaver mode is **local only**
- No data is sent to servers
- Tracking data continues to update in the background
- Exiting screensaver returns to normal tracking view

## Tips & Tricks

### Pro Tips
1. **Use ESC for fastest exit** - Keyboard is faster than mouse
2. **Hover over button to reveal it** - The button appears on hover in screensaver mode
3. **Watch the stats** - Top bar shows real-time game statistics
4. **Enjoy the show** - The AI is quite good at destroying asteroids!

### Fun Facts
- The spaceship uses **linear regression** to detect acceleration
- Asteroids have **procedurally generated shapes**
- UFOs have **intelligent targeting** systems
- The game includes **hyperspace mechanics** for emergency evasion

## Feedback & Issues

If you encounter any issues with the screensaver:

1. Check the browser console for error messages (F12)
2. Try refreshing the page
3. Clear browser cache and reload
4. Test in a different browser
5. Report issues on GitHub

## Future Enhancements

Planned improvements:
- [ ] Customizable screensaver themes
- [ ] Sound effects toggle
- [ ] Difficulty levels
- [ ] High score tracking
- [ ] Custom idle timeout UI
- [ ] Screensaver scheduling

---

**Enjoy your ATLAS Screensaver!** 🚀✨
