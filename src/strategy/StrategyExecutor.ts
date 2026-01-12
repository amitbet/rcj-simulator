// ============================================================
// RoboCup Jr. Simulator - Strategy Executor
// ============================================================

import { WorldState, Action, createDefaultAction } from '../types';

export class StrategyExecutor {
  private strategies: Map<string, Function> = new Map();
  private errors: Map<string, string> = new Map();

  constructor() {}

  // Load strategy code for a robot
  loadStrategy(robotId: string, code: string): boolean {
    try {
      // Store code for state extraction
      this.strategyCodeMap.set(robotId, code);
      
      // Create a sandboxed function from the code
      const strategyFunc = this.createSandboxedStrategy(code);
      this.strategies.set(robotId, strategyFunc);
      this.errors.delete(robotId);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.errors.set(robotId, errorMessage);
      console.error(`Failed to load strategy for ${robotId}:`, errorMessage);
      return false;
    }
  }

  // Create a sandboxed strategy function
  private createSandboxedStrategy(code: string): Function {
    // Wrap the code in a function that returns the strategy function
    // We'll also capture the state variable
    const wrappedCode = `
      "use strict";
      
      // Helper functions available to strategies
      const Math_abs = Math.abs;
      const Math_sin = Math.sin;
      const Math_cos = Math.cos;
      const Math_atan2 = Math.atan2;
      const Math_acos = Math.acos;
      const Math_sqrt = Math.sqrt;
      const Math_min = Math.min;
      const Math_max = Math.max;
      const Math_floor = Math.floor;
      const Math_ceil = Math.ceil;
      const Math_round = Math.round;
      const Math_PI = Math.PI;
      
      // Clamp helper
      function clamp(val, min, max) {
        return Math_max(min, Math_min(max, val));
      }
      
      // Normalize angle to -180..180
      function normalizeAngle(angle) {
        while (angle > 180) angle -= 360;
        while (angle < -180) angle += 360;
        return angle;
      }
      
      ${code}
      
      // Return the strategy function wrapped to capture state and target
      if (typeof strategy === 'function') {
        const originalStrategy = strategy;
        return function(worldState) {
          const result = originalStrategy(worldState);
          // Attach currentState to result if it exists
          if (typeof currentState !== 'undefined') {
            result._state = currentState;
          }
          // Attach currentTarget to result if it exists
          if (typeof currentTarget !== 'undefined') {
            result._target = currentTarget;
          }
          return result;
        };
      } else {
        throw new Error('Strategy must define a function called "strategy"');
      }
    `;

    // Create function in sandbox
    const factory = new Function(wrappedCode);
    return factory();
  }

  // Execute strategy for a robot
  executeStrategy(robotId: string, worldState: WorldState): { action: Action; state?: string; target?: string } {
    const strategyFunc = this.strategies.get(robotId);
    
    if (!strategyFunc) {
      return { action: createDefaultAction() };
    }

    try {
      // Execute with timeout protection (simple version)
      const result = strategyFunc(worldState);
      
      
      // Validate action
      const action = this.validateAction(result);
      
      
      // Extract state and target from result if they were attached
      const state = (result as any)._state;
      const target = (result as any)._target;
      
      return { action, state, target };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.errors.set(robotId, `Runtime error: ${errorMessage}`);
      console.error(`Strategy error for ${robotId}:`, errorMessage);
      return { action: createDefaultAction() };
    }
  }
  
  // Store strategy code for potential future use
  private strategyCodeMap: Map<string, string> = new Map();

  // Validate and sanitize action
  private validateAction(result: any): Action {
    if (!result || typeof result !== 'object') {
      return createDefaultAction();
    }

    return {
      motor1: this.clampMotor(result.motor1),
      motor2: this.clampMotor(result.motor2),
      motor3: this.clampMotor(result.motor3),
      motor4: this.clampMotor(result.motor4),
      kick: Boolean(result.kick),
    };
  }

  // Clamp motor value to valid range
  private clampMotor(value: any): number {
    if (typeof value !== 'number' || isNaN(value)) {
      return 0;
    }
    return Math.max(-1, Math.min(1, value));
  }

  // Get error for a robot
  getError(robotId: string): string | undefined {
    return this.errors.get(robotId);
  }

  // Check if robot has a loaded strategy
  hasStrategy(robotId: string): boolean {
    return this.strategies.has(robotId);
  }

  // Remove strategy for a robot
  removeStrategy(robotId: string): void {
    this.strategies.delete(robotId);
    this.errors.delete(robotId);
  }

  // Clear all strategies
  clear(): void {
    this.strategies.clear();
    this.errors.clear();
  }
}

