// Rust: The Ghost Future
// Demonstrates Rust's lazy pull-based Future state machine
// Calling an async fn does NOT execute work until actively polled!

let mut nums = vec![-4, -1, 0, 1, 2];
let (mut left, mut right) = (0, nums.len() - 1);

// This future is allocated in memory, but LAZY:
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
}
