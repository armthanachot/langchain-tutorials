import { v4 as uuidv4 } from "uuid";
import * as z from "zod";
import { StateGraph, StateSchema, type GraphNode, START, END, MemorySaver, Topic } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

const State = new StateSchema({
    topic: z.string().optional(),
    joke: z.string().optional(),
});

const model = new ChatOpenAI({
    model: "gpt-4o-mini",
    temperature: 0,
});

const generateTopic: typeof State.Node = async (state) => {
    // LLM call to generate a topic for the joke
    const msg = await model.invoke("Give me a funny topic for a joke");
    return { topic: msg.text };
};

const writeJoke: typeof State.Node = async (state) => {
    // LLM call to write a joke based on the topic
    const msg = await model.invoke(`Write a short joke about ${state.topic}`);
    return { joke: msg.text };
};

// Build workflow
const workflow = new StateGraph(State)
    // Add nodes
    .addNode("generateTopic", generateTopic)
    .addNode("writeJoke", writeJoke)
    // Add edges to connect nodes
    .addEdge(START, "generateTopic")
    .addEdge("generateTopic", "writeJoke")
    .addEdge("writeJoke", END);

// Compile
const checkpointer = new MemorySaver();
const graph = workflow.compile({ checkpointer });


// run the graph
const config = {
    configurable: {
        thread_id: uuidv4(),
    },
};

const state = await graph.invoke({}, config);

console.log(state.topic);
console.log();
console.log(state.joke);


// identify a checkpoint
/**
 * 
 * use getStateHistory to get the history of the state
 */
const states = [];
for await (const state of graph.getStateHistory(config)) {
    states.push(state);
}

for (const state of states) {
    console.log(state.next);
    console.log(state.config.configurable?.checkpoint_id);
    console.log();
}

const selectedState = states[1];
console.log("next", selectedState?.next); // next is the next node to be executed
console.log("values", selectedState?.values); // values is the state of the graph (value of state[1] in this case)

// update state (optional)

const newConfig = await graph.updateState(selectedState!.config, { topic: "chicken" })

console.log("newConfig", newConfig);

// resume the graph from the checkpoint

const finalResult = await graph.invoke(null, newConfig);

console.log("finalResult", finalResult);
