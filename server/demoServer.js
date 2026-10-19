const http = require('http');

const PORT = 3456;

// Dynamic Curriculum Database that can be updated live
const CURRICULUM = [
  {
    id: 'three-sum-two-pointers',
    title: 'Three-Sum & The Two-Pointer Convergence',
    category: 'Algorithms & DSA',
    language: 'javascript',
    difficulty: 'Intermediate',
    description: 'Watch how sorting an array enables linear two-pointer scanning (left and right) to locate triplets summing to zero in O(N^2).',
    tags: ['DSA', 'Two Pointers', 'Arrays', 'Sorting'],
    code: `// Three-Sum: Finding triplets that sum to 0
let nums = [-4, -1, -1, 0, 1, 2];
nums.sort();

let res = [];
let target = 0;

for (let i = 0; i < nums.length - 2; i++) {
  let left = i + 1;
  let right = nums.length - 1;

  while (left < right) {
    let sum = nums[i] + nums[left] + nums[right];
    if (sum === target) {
      console.log("Found triplet: " + nums[i] + ", " + nums[left] + ", " + nums[right]);
      left++;
      right--;
    } else if (sum < target) {
      left++;
    } else {
      right--;
    }
  }
}`,
    quiz: {
      question: 'When the current sum is less than the target, why do we increment the left pointer instead of decrementing right?',
      options: [
        'Because the array is sorted, moving left to the right increases the total sum',
        'Because left must always match i',
        'Because right has already reached the end',
        'It makes no difference in a sorted array'
      ],
      correctIndex: 0,
      explanation: 'Since the array is sorted in ascending order, nums[left + 1] >= nums[left]. Incrementing left is the only move guaranteed to increase or maintain the sum.'
    }
  },
  {
    id: 'js-microtask-starvation',
    title: 'The JavaScript Microtask Priority Trap',
    category: 'Concurrency & Runtimes',
    language: 'javascript',
    difficulty: 'Intermediate',
    description: 'Demystifies why Promise.resolve().then() executes before setTimeout(..., 0), and how microtasks can completely starve the macrotask queue.',
    tags: ['Event Loop', 'Promises', 'Microtasks', 'Macrotasks'],
    code: `console.log("1. Synchronous Start");

setTimeout(() => {
  console.log("4. Macrotask (setTimeout 0ms)");
}, 0);

Promise.resolve().then(() => {
  console.log("2. Microtask #1 (Promise)");
}).then(() => {
  console.log("3. Microtask #2 (Chained Promise)");
});

console.log("1. Synchronous End");`,
    quiz: {
      question: 'Why does "Microtask #2" execute before "Macrotask (setTimeout 0ms)" even though setTimeout has a 0ms delay?',
      options: [
        'The Microtask Queue is completely drained before the Event Loop checks the Macrotask Queue',
        'setTimeout(..., 0) has a mandatory 1-second delay in V8',
        'Promises run on a separate background thread in JavaScript',
        'The call stack is bypassed by setTimeout'
      ],
      correctIndex: 0,
      explanation: 'In the JS event loop specification, whenever the Call Stack empties, all tasks in the Microtask Queue are executed until the microtask queue is 100% empty before picking the next macrotask.'
    }
  },
  {
    id: 'rust-lazy-future-ghost',
    title: 'The Rust Ghost Future (Lazy vs Eager)',
    category: 'Concurrency & Runtimes',
    language: 'rust',
    difficulty: 'Advanced',
    description: 'Contrasts Rust futures with JS Promises. Demonstrates why unpolled Rust futures allocate state but execute ZERO CPU instructions.',
    tags: ['Rust', 'Futures', 'Tokio', 'Async/Await', 'Poll'],
    code: `// In Rust, calling an async function does NOT start it!
let mut nums = vec![-4, -1, 0, 1, 2];
let (mut left, mut right) = (0, nums.len() - 1);

// This future is allocated, but LAZY:
let fut = fetch_data_async();

println!("Notice that the future never executed!");
println!("Rust futures require an explicit .await or executor poll!");

while left < right {
    let sum = nums[left] + nums[right];
    if sum < 0 {
        left += 1;
    } else {
        right -= 1;
    }
}`,
    quiz: {
      question: 'What happens when you call an async fn in Rust without .await?',
      options: [
        'It returns an anonymous Future state machine struct, doing zero work until polled',
        'It runs in the background thread pool like JavaScript',
        'The compiler immediately throws a runtime panic',
        'It blocks the current OS thread'
      ],
      correctIndex: 0,
      explanation: 'Rust futures follow a zero-cost pull model. Unlike JS Promises (which eagerly run when instantiated), Rust futures only make progress when driven by an executor calling poll().'
    }
  },
  {
    id: 'python-two-pointer-water',
    title: 'Python: Container With Most Water',
    category: 'Algorithms & DSA',
    language: 'python',
    difficulty: 'Intermediate',
    description: 'Dynamic two-pointer optimization shrinking the boundary from both ends to find the maximum water area in O(N).',
    tags: ['Python', 'DSA', 'Two Pointers', 'Optimization'],
    code: `# Container With Most Water
heights = [1, 8, 6, 2, 5, 4, 8, 3, 7]
left, right = 0, len(heights) - 1
max_area = 0

while left < right:
    width = right - left
    h = heights[left] if heights[left] < heights[right] else heights[right]
    area = width * h
    if area > max_area:
        max_area = area
    
    if heights[left] < heights[right]:
        left += 1
    else:
        right -= 1

print("Maximum area calculated: " + str(max_area))`,
    quiz: {
      question: 'Why do we move the pointer pointing to the shorter vertical line inward?',
      options: [
        'Moving the taller line can never produce a larger area since area is constrained by the shorter line',
        'Because the shorter line is always on the left',
        'To increase the width of the container',
        'To reverse the direction of search'
      ],
      correctIndex: 0,
      explanation: 'Area is bounded by min(h[left], h[right]) * width. Moving the taller line inward reduces width while keeping the height bound <= the shorter line, which can never yield a larger area.'
    }
  }
];

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/curriculum' || req.url === '/api/v1/curriculum.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(CURRICULUM, null, 2));
    console.log(`[Server] Served ${CURRICULUM.length} curriculum modules to client.`);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

server.listen(PORT, () => {
  console.log(`🚀 Fermas Dynamic Curriculum Server running at http://localhost:${PORT}/api/curriculum`);
});
