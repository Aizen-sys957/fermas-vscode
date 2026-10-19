# Container With Most Water (Python Two-Pointer Optimization)
# Watch pointers 'left' and 'right' automatically pin above the array ribbon!

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

print("Maximum area calculated: " + str(max_area))
