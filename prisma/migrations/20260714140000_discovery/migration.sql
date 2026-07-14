-- CreateTable
CREATE TABLE `swipes` (
    `id` VARCHAR(191) NOT NULL,
    `swiper_id` VARCHAR(191) NOT NULL,
    `target_id` VARCHAR(191) NOT NULL,
    `direction` ENUM('LEFT', 'RIGHT') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `swipes_target_id_idx`(`target_id`),
    UNIQUE INDEX `swipes_swiper_id_target_id_key`(`swiper_id`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `matches` (
    `id` VARCHAR(191) NOT NULL,
    `user_a` VARCHAR(191) NOT NULL,
    `user_b` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'BLOCKED', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
    `matched_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `matches_user_b_idx`(`user_b`),
    UNIQUE INDEX `matches_user_a_user_b_key`(`user_a`, `user_b`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `swipes` ADD CONSTRAINT `swipes_swiper_id_fkey` FOREIGN KEY (`swiper_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `swipes` ADD CONSTRAINT `swipes_target_id_fkey` FOREIGN KEY (`target_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `matches` ADD CONSTRAINT `matches_user_a_fkey` FOREIGN KEY (`user_a`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `matches` ADD CONSTRAINT `matches_user_b_fkey` FOREIGN KEY (`user_b`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
