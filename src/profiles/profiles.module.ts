import { Module } from '@nestjs/common';
import { ProfilesController } from './profiles.controller';
import { PublicProfileController } from './public-profile.controller';
import { ProfilesService } from './profiles.service';
import { SafetyModule } from '../safety/safety.module';

@Module({
  imports: [SafetyModule],
  controllers: [ProfilesController, PublicProfileController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
