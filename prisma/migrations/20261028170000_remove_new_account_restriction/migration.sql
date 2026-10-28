-- remove-new-account-restriction (28/10/2026): mức tin cậy không còn là lý do hạn chế. Gỡ lý do trên tin đang mang;
-- giá trị enum giữ lại vì Postgres không xoá được giá trị enum, code không ghi nữa.
UPDATE "listings"
SET "restrictions" = array_remove("restrictions", 'new_account'::"listing_restriction")
WHERE 'new_account'::"listing_restriction" = ANY("restrictions");
