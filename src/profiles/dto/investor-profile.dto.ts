import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FundingBracket, InvestorType } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class InvestorProfileDto {
  @ApiProperty({ enum: InvestorType })
  @IsEnum(InvestorType)
  investorType: InvestorType;

  @ApiProperty({ example: ['FinTech', 'SaaS'], description: 'Up to 8 sectors' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  sectors: string[];

  @ApiProperty({ example: ['Seed', 'Series A'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  stages: string[];

  @ApiProperty({ enum: FundingBracket })
  @IsEnum(FundingBracket)
  ticketMin: FundingBracket;

  @ApiProperty({ enum: FundingBracket })
  @IsEnum(FundingBracket)
  ticketMax: FundingBracket;

  @ApiProperty({ example: ['GLOBAL'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  geoFocus: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  horizon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  involvement?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  coInvest?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  dealsCount?: number;
}
