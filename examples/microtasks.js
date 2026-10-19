// JavaScript Event Loop: Microtasks vs Macrotasks
// In Fermas, watch how the Microtask Queue completely starves
// the Macrotask (setTimeout) Queue until it is 100% drained!

console.log("1. Synchronous Start");

setTimeout(() => {
  console.log("4. Macrotask (setTimeout 0ms)");
}, 0);

Promise.resolve().then(() => {
  console.log("2. Microtask #1 (Promise)");
}).then(() => {
  console.log("3. Microtask #2 (Chained Promise)");
});

console.log("1. Synchronous End");
