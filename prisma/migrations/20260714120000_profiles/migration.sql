-- Add profile-completed flag to users
ALTER TABLE `users` ADD COLUMN `profile_completed` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `investor_profiles` (
    `user_id` VARCHAR(191) NOT NULL,
    `investor_type` ENUM('ANGEL', 'VC', 'FAMILY_OFFICE', 'CORPORATE', 'INDIVIDUAL') NOT NULL,
    `sectors` JSON NOT NULL,
    `stages` JSON NOT NULL,
    `ticket_min` ENUM('B_5K_25K', 'B_25K_100K', 'B_100K_500K', 'B_500K_2M', 'B_2M_PLUS') NOT NULL,
    `ticket_max` ENUM('B_5K_25K', 'B_25K_100K', 'B_100K_500K', 'B_500K_2M', 'B_2M_PLUS') NOT NULL,
    `geo_focus` JSON NOT NULL,
    `horizon` VARCHAR(191) NULL,
    `involvement` VARCHAR(191) NULL,
    `co_invest` BOOLEAN NULL,
    `deals_count` INTEGER NULL,
    `verified_badge` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `innovator_profiles` (
    `user_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `sector` VARCHAR(191) NOT NULL,
    `stage` ENUM('IDEA', 'PROTOTYPE', 'REVENUE_GENERATING', 'SCALING') NOT NULL,
    `one_liner` VARCHAR(140) NOT NULL,
    `problem` VARCHAR(600) NOT NULL,
    `solution` VARCHAR(1000) NOT NULL,
    `business_model` ENUM('B2B', 'B2C', 'B2B2C', 'MARKETPLACE', 'SUBSCRIPTION', 'OTHER') NOT NULL,
    `funding_min` ENUM('B_5K_25K', 'B_25K_100K', 'B_100K_500K', 'B_500K_2M', 'B_2M_PLUS') NOT NULL,
    `funding_max` ENUM('B_5K_25K', 'B_25K_100K', 'B_100K_500K', 'B_500K_2M', 'B_2M_PLUS') NOT NULL,
    `instrument` ENUM('EQUITY', 'SAFE', 'CONVERTIBLE_NOTE', 'REVENUE_SHARE', 'OPEN_TO_DISCUSS') NOT NULL,
    `breakeven_months` INTEGER NULL,
    `rev_y1` VARCHAR(191) NULL,
    `rev_y2` VARCHAR(191) NULL,
    `rev_y3` VARCHAR(191) NULL,
    `traction` VARCHAR(500) NULL,
    `geo_market` JSON NOT NULL,
    `deck_url` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mediator_profiles` (
    `user_id` VARCHAR(191) NOT NULL,
    `prof_title` VARCHAR(191) NOT NULL,
    `qualification` VARCHAR(191) NOT NULL,
    `license_no` VARCHAR(191) NOT NULL,
    `license_body` VARCHAR(191) NOT NULL,
    `jurisdictions` JSON NOT NULL,
    `years_exp` INTEGER NOT NULL,
    `specializations` JSON NOT NULL,
    `firm` VARCHAR(191) NULL,
    `fee_model` ENUM('HOURLY', 'FIXED_PER_DEAL', 'SUCCESS_FEE') NOT NULL,
    `fee_range` VARCHAR(191) NULL,
    `verification_status` ENUM('PENDING', 'VERIFIED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `verified_at` DATETIME(3) NULL,
    `verified_by` VARCHAR(191) NULL,
    `rejection_reason` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `investor_profiles` ADD CONSTRAINT `investor_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `innovator_profiles` ADD CONSTRAINT `innovator_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mediator_profiles` ADD CONSTRAINT `mediator_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
