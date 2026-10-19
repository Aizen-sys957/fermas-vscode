// Three-Sum: Finding triplets that sum to 0 using Two Pointers
// Notice how Fermas automatically infers pointer badges for:
// i (anchor), left (low bound), and right (high bound)
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
}
