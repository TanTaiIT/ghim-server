-- Giá trị enum mới đứng riêng một migration (add-strikes): việc về gậy đóng vì gậy đã đổi ở đường khác.
ALTER TYPE "review_close_cause" ADD VALUE 'strike_closed';
