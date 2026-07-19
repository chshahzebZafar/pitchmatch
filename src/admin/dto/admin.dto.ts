import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MediatorVerificationStatus, ReportStatus, UserStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Approve or reject a mediator's credentials. PENDING is not offered — a
 *  decision endpoint that can un-decide would just hide mistakes. */
export class MediatorDecisionDto {
  @ApiProperty({ enum: [MediatorVerificationStatus.VERIFIED, MediatorVerificationStatus.REJECTED] })
  @IsEnum(MediatorVerificationStatus)
  status: MediatorVerificationStatus;

  @ApiPropertyOptional({ description: 'Internal note; also sent to the mediator on rejection', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReportDecisionDto {
  @ApiProperty({ enum: ReportStatus })
  @IsEnum(ReportStatus)
  status: ReportStatus;
}

/** Suspend or reinstate. DELETED is not exposed: account deletion is the
 *  user's own right and needs a separate, auditable flow. */
export class UserStatusDto {
  @ApiProperty({ enum: [UserStatus.ACTIVE, UserStatus.SUSPENDED] })
  @IsEnum(UserStatus)
  status: UserStatus;
}
