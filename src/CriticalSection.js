/**
 * Created by claudio on 2019-11-21
 */

// Module variables
//

// References to external code
//
// Internal node modules
//import util from 'util';
// Third-party node modules

export class CriticalSection {
    constructor () {
        this.processing = false;
        this.waitingTasks = [];
    }

    // CAUTION: a code being executed from one critical section object MUST NOT
    //  execute another code from the same critical section object. In other words:
    //  CRITICAL SECTION EXECUTIONS MUST NOT BE NESTED.
    async execute(code) {
        try {
            if (this.processing) {
                // Already doing processing. Wait for current executing
                //  code to finish before proceeding
                await new Promise(resolve => this.waitingTasks.push({resolve}));
            }
            else {
                // No processing currently underway. Indicate that processing started,
                //  and continue to execute code
                this.processing = true;
            }

            const result = code();

            if (result instanceof Promise) {
                await result;
            }
        }
        finally {
            // Code has finished executing (either gracefully or with error).
            //  Check if there are other pieces of code waiting for execution
            if (this.waitingTasks.length > 0) {
                // Release next code in queue for execution
                this.waitingTasks.shift().resolve();
            }
            else {
                // No more code to execute. Just indicate that processing has ended
                this.processing = false;
            }
        }
    }
}
