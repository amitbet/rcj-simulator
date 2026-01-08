// ============================================================
// RoboCup Jr. Simulator - 2D Canvas Renderer
// ============================================================

import { SimulationState, GamePhase, Team, RobotRole } from '../types';
import { FIELD, GOAL, BALL, ROBOT, COLORS, NEUTRAL_SPOTS } from '../types/constants';

export class Renderer2D {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scale: number = 3; // pixels per cm
  private offsetX: number = 0;
  private offsetY: number = 0;

  // Drag state
  private dragTarget: { type: 'ball' | 'robot'; id?: string } | null = null;
  private onDragUpdate: ((type: 'ball' | 'robot', id: string | null, x: number, y: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;

    this.setupCanvas();
    this.setupInteraction();
  }

  private setupCanvas(): void {
    // Set canvas size
    const container = this.canvas.parentElement;
    if (container) {
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
    } else {
      this.canvas.width = 800;
      this.canvas.height = 600;
    }

    // Calculate scale to fit field
    const fieldW = FIELD.WIDTH + FIELD.OUTER_WIDTH * 2 + GOAL.DEPTH * 2;
    const fieldH = FIELD.HEIGHT + FIELD.OUTER_WIDTH * 2 + GOAL.DEPTH * 2;
    
    const scaleX = (this.canvas.width - 40) / fieldW;
    const scaleY = (this.canvas.height - 40) / fieldH;
    this.scale = Math.min(scaleX, scaleY);

    // Center the field
    this.offsetX = this.canvas.width / 2;
    this.offsetY = this.canvas.height / 2;
  }

  private setupInteraction(): void {
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('mouseleave', this.handleMouseUp);
  }

  private handleMouseDown = (e: MouseEvent): void => {
    // Handled by external component
  };

  private handleMouseMove = (e: MouseEvent): void => {
    // Handled by external component
  };

  private handleMouseUp = (): void => {
    this.dragTarget = null;
  };

  // Convert world coordinates to canvas coordinates
  private toCanvas(x: number, y: number): { x: number; y: number } {
    return {
      x: this.offsetX + x * this.scale,
      y: this.offsetY + y * this.scale,
    };
  }

  // Convert canvas coordinates to world coordinates
  toWorld(canvasX: number, canvasY: number): { x: number; y: number } {
    return {
      x: (canvasX - this.offsetX) / this.scale,
      y: (canvasY - this.offsetY) / this.scale,
    };
  }

  // Main render function
  render(state: SimulationState): void {
    const { ctx } = this;
    
    // Clear
    ctx.fillStyle = COLORS.UI_BACKGROUND;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw field
    this.drawField();
    
    // Draw goals
    this.drawGoals();
    
    // Draw neutral spots
    this.drawNeutralSpots();
    
    // Draw robots (only if position is valid)
    for (const robot of state.robots) {
      if (isFinite(robot.x) && isFinite(robot.y) && isFinite(robot.angle)) {
        this.drawRobot(robot.x, robot.y, robot.angle, robot.team, robot.role);
      }
    }
    
    // Draw ball (only if position is valid)
    if (isFinite(state.ball.x) && isFinite(state.ball.y)) {
      this.drawBall(state.ball.x, state.ball.y);
    }

    // Draw game state overlay
    this.drawOverlay(state);
  }

  private drawField(): void {
    const { ctx } = this;
    const fieldHalfW = FIELD.WIDTH / 2;
    const fieldHalfH = FIELD.HEIGHT / 2;
    const outerHalfW = fieldHalfW + FIELD.OUTER_WIDTH;
    const outerHalfH = fieldHalfH + FIELD.OUTER_WIDTH;

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // Outer area background (brown/tan like wood surface)
    ctx.fillStyle = '#8B7355';  // Tan/wood color
    ctx.fillRect(-outerHalfW, -outerHalfH, FIELD.TOTAL_WIDTH, FIELD.TOTAL_HEIGHT);

    // Green playing field
    ctx.fillStyle = COLORS.FIELD_GREEN;
    ctx.fillRect(-fieldHalfW, -fieldHalfH, FIELD.WIDTH, FIELD.HEIGHT);

    // Field pattern (checkerboard-ish)
    ctx.fillStyle = COLORS.FIELD_DARK_GREEN;
    const gridSize = 20;
    for (let x = -fieldHalfW; x < fieldHalfW; x += gridSize * 2) {
      for (let y = -fieldHalfH; y < fieldHalfH; y += gridSize * 2) {
        ctx.fillRect(x, y, gridSize, gridSize);
        ctx.fillRect(x + gridSize, y + gridSize, gridSize, gridSize);
      }
    }

    // White lines on field boundary
    ctx.strokeStyle = COLORS.LINE_WHITE;
    ctx.lineWidth = FIELD.LINE_WIDTH;

    // Field boundary lines
    ctx.strokeRect(-fieldHalfW, -fieldHalfH, FIELD.WIDTH, FIELD.HEIGHT);

    // Center line
    ctx.beginPath();
    ctx.moveTo(-fieldHalfW, 0);
    ctx.lineTo(fieldHalfW, 0);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(0, 0, FIELD.CENTER_CIRCLE_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = COLORS.LINE_WHITE;
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();

    // Goal areas
    const goalAreaWidth = GOAL.WIDTH + 20;
    const goalAreaDepth = 20;
    
    // Blue goal area (top)
    ctx.strokeStyle = COLORS.LINE_WHITE;
    ctx.strokeRect(-goalAreaWidth / 2, -fieldHalfH, goalAreaWidth, goalAreaDepth);
    
    // Yellow goal area (bottom)
    ctx.strokeRect(-goalAreaWidth / 2, fieldHalfH - goalAreaDepth, goalAreaWidth, goalAreaDepth);

    // Walls at OUTER boundary
    ctx.fillStyle = COLORS.WALL_BLACK;
    const wallThickness = 5;
    const goalHalfW = GOAL.WIDTH / 2;
    
    // Left wall (full height at outer boundary)
    ctx.fillRect(-outerHalfW - wallThickness, -outerHalfH, wallThickness, FIELD.TOTAL_HEIGHT);
    // Right wall (full height at outer boundary)
    ctx.fillRect(outerHalfW, -outerHalfH, wallThickness, FIELD.TOTAL_HEIGHT);
    
    // Top wall segments at outer boundary (with gap leading to goal)
    // Left segment
    ctx.fillRect(-outerHalfW, -outerHalfH - wallThickness, outerHalfW - goalHalfW, wallThickness);
    // Right segment
    ctx.fillRect(goalHalfW, -outerHalfH - wallThickness, outerHalfW - goalHalfW, wallThickness);
    
    // Bottom wall segments at outer boundary (with gap leading to goal)
    ctx.fillRect(-outerHalfW, outerHalfH, outerHalfW - goalHalfW, wallThickness);
    ctx.fillRect(goalHalfW, outerHalfH, outerHalfW - goalHalfW, wallThickness);

    // Diagonal walls connecting goal area to outer walls
    ctx.lineWidth = wallThickness;
    ctx.strokeStyle = COLORS.WALL_BLACK;
    
    // Top-left diagonal
    ctx.beginPath();
    ctx.moveTo(-goalHalfW, -fieldHalfH);
    ctx.lineTo(-goalHalfW - FIELD.OUTER_WIDTH, -outerHalfH);
    ctx.stroke();
    
    // Top-right diagonal
    ctx.beginPath();
    ctx.moveTo(goalHalfW, -fieldHalfH);
    ctx.lineTo(goalHalfW + FIELD.OUTER_WIDTH, -outerHalfH);
    ctx.stroke();
    
    // Bottom-left diagonal
    ctx.beginPath();
    ctx.moveTo(-goalHalfW, fieldHalfH);
    ctx.lineTo(-goalHalfW - FIELD.OUTER_WIDTH, outerHalfH);
    ctx.stroke();
    
    // Bottom-right diagonal
    ctx.beginPath();
    ctx.moveTo(goalHalfW, fieldHalfH);
    ctx.lineTo(goalHalfW + FIELD.OUTER_WIDTH, outerHalfH);
    ctx.stroke();

    ctx.restore();
  }

  private drawGoals(): void {
    const { ctx } = this;
    const halfH = FIELD.HEIGHT / 2;

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // Blue goal (top)
    ctx.fillStyle = COLORS.GOAL_BLUE;
    ctx.fillRect(-GOAL.WIDTH / 2, -halfH - GOAL.DEPTH, GOAL.WIDTH, GOAL.DEPTH);
    ctx.strokeStyle = '#004499';
    ctx.lineWidth = 1;
    ctx.strokeRect(-GOAL.WIDTH / 2, -halfH - GOAL.DEPTH, GOAL.WIDTH, GOAL.DEPTH);

    // Yellow goal (bottom)
    ctx.fillStyle = COLORS.GOAL_YELLOW;
    ctx.fillRect(-GOAL.WIDTH / 2, halfH, GOAL.WIDTH, GOAL.DEPTH);
    ctx.strokeStyle = '#cc9900';
    ctx.lineWidth = 1;
    ctx.strokeRect(-GOAL.WIDTH / 2, halfH, GOAL.WIDTH, GOAL.DEPTH);

    ctx.restore();
  }

  private drawNeutralSpots(): void {
    const { ctx } = this;

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // Draw neutral spots as small crosses (less prominent)
    ctx.strokeStyle = '#ffffff33';
    ctx.lineWidth = 0.5;
    const crossSize = 4;
    
    for (const spot of NEUTRAL_SPOTS) {
      ctx.beginPath();
      ctx.moveTo(spot.x - crossSize, spot.y);
      ctx.lineTo(spot.x + crossSize, spot.y);
      ctx.moveTo(spot.x, spot.y - crossSize);
      ctx.lineTo(spot.x, spot.y + crossSize);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawRobot(x: number, y: number, angle: number, team: Team, role: RobotRole): void {
    const { ctx } = this;

    // Validate robot position - if invalid, don't render
    if (!isFinite(x) || !isFinite(y) || !isFinite(angle) || Math.abs(x) > 1000 || Math.abs(y) > 1000) {
      console.warn(`[drawRobot] Invalid robot position: (${x}, ${y}), angle: ${angle}, skipping render`);
      return;
    }

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);
    ctx.translate(x, y);
    ctx.rotate(angle);

    const radius = ROBOT.RADIUS;
    const notchAngle = (ROBOT.NOTCH_ANGLE * Math.PI) / 180;

    // Robot body (pac-man shape with kicker notch)
    const teamColor = team === 'blue' ? COLORS.TEAM_BLUE : COLORS.TEAM_YELLOW;
    const lightColor = team === 'blue' ? COLORS.TEAM_BLUE_LIGHT : COLORS.TEAM_YELLOW_LIGHT;
    
    // Gradient for 3D effect
    if (isFinite(radius) && radius > 0) {
      try {
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
        gradient.addColorStop(0, lightColor);
        gradient.addColorStop(1, teamColor);
        ctx.fillStyle = gradient;
      } catch (e) {
        ctx.fillStyle = teamColor;
      }
    } else {
      ctx.fillStyle = teamColor;
    }
    
    // Draw pac-man shape (circle with wedge cut out at front)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, notchAngle / 2, 2 * Math.PI - notchAngle / 2);
    ctx.closePath();
    ctx.fill();

    // Border
    ctx.strokeStyle = team === 'blue' ? '#1565C0' : '#F57C00';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Kicker area (dark triangular notch)
    ctx.fillStyle = '#333333';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(radius * Math.cos(-notchAngle / 2), radius * Math.sin(-notchAngle / 2));
    ctx.lineTo(radius * 0.7, 0);
    ctx.lineTo(radius * Math.cos(notchAngle / 2), radius * Math.sin(notchAngle / 2));
    ctx.closePath();
    ctx.fill();

    // Role indicator
    ctx.fillStyle = '#ffffff';
    ctx.font = `${radius * 0.6}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(role === 'attacker' ? 'A' : 'D', -radius * 0.3, 0);

    // Direction indicator (small arrow)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(radius * 0.3, 0);
    ctx.lineTo(radius * 0.6, 0);
    ctx.lineTo(radius * 0.5, -radius * 0.15);
    ctx.moveTo(radius * 0.6, 0);
    ctx.lineTo(radius * 0.5, radius * 0.15);
    ctx.stroke();

    // Omni wheel indicators (4 small circles)
    ctx.fillStyle = '#444444';
    const wheelAngles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
    for (const wa of wheelAngles) {
      const wx = (radius - 2) * Math.cos(wa);
      const wy = (radius - 2) * Math.sin(wa);
      ctx.beginPath();
      ctx.arc(wx, wy, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawBall(x: number, y: number): void {
    const { ctx } = this;

    // Validate ball position - if invalid, don't render
    if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 1000 || Math.abs(y) > 1000) {
      console.warn(`[drawBall] Invalid ball position: (${x}, ${y}), skipping render`);
      return;
    }

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // Ball shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + 0.5, y + 0.5, BALL.RADIUS, BALL.RADIUS * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ball body - validate gradient coordinates
    const gradientX1 = x - BALL.RADIUS * 0.3;
    const gradientY1 = y - BALL.RADIUS * 0.3;
    const gradientX2 = x;
    const gradientY2 = y;
    
    // Only create gradient if all values are finite
    if (isFinite(gradientX1) && isFinite(gradientY1) && isFinite(gradientX2) && isFinite(gradientY2) && isFinite(BALL.RADIUS)) {
      try {
        const gradient = ctx.createRadialGradient(
          gradientX1,
          gradientY1,
          0,
          gradientX2,
          gradientY2,
          BALL.RADIUS
        );
        gradient.addColorStop(0, '#ff9944');
        gradient.addColorStop(0.7, COLORS.BALL_ORANGE);
        gradient.addColorStop(1, '#cc4400');
        ctx.fillStyle = gradient;
      } catch (e) {
        // Fallback to solid color if gradient fails
        console.warn(`[drawBall] Gradient creation failed, using solid color:`, e);
        ctx.fillStyle = COLORS.BALL_ORANGE;
      }
    } else {
      // Fallback to solid color if coordinates are invalid
      ctx.fillStyle = COLORS.BALL_ORANGE;
    }

    ctx.beginPath();
    ctx.arc(x, y, BALL.RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(x - BALL.RADIUS * 0.3, y - BALL.RADIUS * 0.3, BALL.RADIUS * 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawOverlay(state: SimulationState): void {
    const { ctx, canvas } = this;
    const { game } = state;

    // Phase-specific overlays
    if (game.phase === GamePhase.Kickoff || game.phase === GamePhase.Goal || game.phase === GamePhase.OutOfBounds) {
      // Darken background
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Message
      ctx.fillStyle = COLORS.UI_ACCENT;
      ctx.font = 'bold 36px Orbitron';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      let message = '';
      switch (game.phase) {
        case GamePhase.Kickoff:
          message = 'KICKOFF';
          break;
        case GamePhase.Goal:
          message = 'GOAL!';
          break;
        case GamePhase.OutOfBounds:
          message = 'OUT OF BOUNDS';
          break;
      }

      ctx.fillText(message, canvas.width / 2, canvas.height / 2 - 30);

      // Countdown
      if (game.countdown_ms > 0) {
        const seconds = Math.ceil(game.countdown_ms / 1000);
        ctx.font = 'bold 72px Orbitron';
        ctx.fillText(seconds.toString(), canvas.width / 2, canvas.height / 2 + 40);
      }
    }

    if (game.phase === GamePhase.Finished) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = COLORS.UI_ACCENT;
      ctx.font = 'bold 48px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 40);

      ctx.font = 'bold 36px Orbitron';
      ctx.fillStyle = COLORS.TEAM_BLUE;
      ctx.fillText(`${game.score_blue}`, canvas.width / 2 - 50, canvas.height / 2 + 30);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(' - ', canvas.width / 2, canvas.height / 2 + 30);
      ctx.fillStyle = COLORS.TEAM_YELLOW;
      ctx.fillText(`${game.score_yellow}`, canvas.width / 2 + 50, canvas.height / 2 + 30);
    }

    // Out of bounds indicator
    if (game.phase === GamePhase.OutOfBounds) {
      // Flash the boundary
      const flash = Math.sin(Date.now() / 100) > 0;
      if (flash) {
        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);
        ctx.scale(this.scale, this.scale);
        
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(-FIELD.WIDTH / 2, -FIELD.HEIGHT / 2, FIELD.WIDTH, FIELD.HEIGHT);
        
        ctx.restore();
      }
    }
  }

  // Resize handler
  resize(): void {
    this.setupCanvas();
  }

  // Get object at position (for drag detection)
  getObjectAt(canvasX: number, canvasY: number, state: SimulationState): { type: 'ball' | 'robot'; id?: string } | null {
    const world = this.toWorld(canvasX, canvasY);
    
    // Check ball
    const ballDist = Math.sqrt(
      Math.pow(world.x - state.ball.x, 2) +
      Math.pow(world.y - state.ball.y, 2)
    );
    if (ballDist < BALL.RADIUS * 3) {
      return { type: 'ball' };
    }

    // Check robots
    for (const robot of state.robots) {
      const robotDist = Math.sqrt(
        Math.pow(world.x - robot.x, 2) +
        Math.pow(world.y - robot.y, 2)
      );
      if (robotDist < ROBOT.RADIUS * 1.2) {
        return { type: 'robot', id: robot.id };
      }
    }

    return null;
  }

  // Cleanup
  dispose(): void {
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('mouseleave', this.handleMouseUp);
  }
}

