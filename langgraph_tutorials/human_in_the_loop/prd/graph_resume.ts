import graph from "./graph_builder";
import config from "./config";
import { Command } from "@langchain/langgraph";

const state = await graph.getState(config);

const getInterrupts = (): { id: string, value: any }[] => {
    const interrupts: { id: string, value: any }[] = [];

    if (state.tasks.length > 0) {
        // console.log('รายการ tasks: ', state.tasks);

        for (const task of state.tasks) {
            // console.log(`รายการ task: ${task.id} มีจำนวน interrupt: ${task.interrupts.length}`);

            for (const interrupt of task.interrupts) {
                // console.log('รายการ interrupt: ', interrupt);
                interrupts.push({ id: interrupt.id!, value: interrupt.value });
            }
        }

    }
    return interrupts;
}

const interrupts = getInterrupts();

console.log('รายการ interrupts: ', interrupts);


for (const interrupt of interrupts) {
    const out = await graph.invoke(new Command({ resume: { [interrupt.id]: { isApproved: false, comment: 'ใส่ WHERE ให้หน่อย' } } }), config);
    console.log('out: ', out);
}