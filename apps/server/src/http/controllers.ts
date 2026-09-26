import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { GameRegistry } from '@cardroom/game-core';
import {
  ErrorCode,
  updateProfileSchema,
  type GameCatalogEntry,
  type MatchHistoryEntry,
  type MeResponse,
  type ProfileDto,
  type PublicRoomSummary,
} from '@cardroom/shared';
import type { ProfileRecord } from '../persistence/models';
import { CurrentIdentity, HttpAuthGuard } from '../auth/http-auth.guard';
import type { AuthIdentity } from '../auth/token-verifier';
import { GAME_REGISTRY } from '../games/tokens';
import { MatchesRepository, ProfilesRepository } from '../persistence/repositories';
import { RoomsService } from '../rooms/rooms.service';

const toProfileDto = (profile: ProfileRecord): ProfileDto => ({
  id: profile.id,
  username: profile.username,
  avatarUrl: profile.avatarUrl,
  createdAt: profile.createdAt.toISOString(),
});

@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

@Controller('games')
export class GamesController {
  constructor(@Inject(GAME_REGISTRY) private readonly registry: GameRegistry) {}

  @Get()
  list(): GameCatalogEntry[] {
    return this.registry.list();
  }
}

@Controller('rooms')
@UseGuards(HttpAuthGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get('public')
  listPublic(): Promise<PublicRoomSummary[]> {
    return this.rooms.listPublic();
  }
}

@Controller('me')
@UseGuards(HttpAuthGuard)
export class MeController {
  constructor(
    private readonly profiles: ProfilesRepository,
    private readonly matches: MatchesRepository,
    @Inject(GAME_REGISTRY) private readonly registry: GameRegistry,
  ) {}

  @Get()
  async me(@CurrentIdentity() identity: AuthIdentity): Promise<MeResponse> {
    const profile = await this.profiles.find(identity.userId);
    return {
      userId: identity.userId,
      email: identity.email,
      profile: profile ? toProfileDto(profile) : null,
    };
  }

  @Put('profile')
  async updateProfile(@CurrentIdentity() identity: AuthIdentity, @Body() body: unknown): Promise<ProfileDto> {
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: ErrorCode.Validation, message: parsed.error.issues[0]?.message });
    }
    const profile = await this.profiles.upsert(identity.userId, {
      username: parsed.data.username,
      avatarUrl: parsed.data.avatarUrl ?? null,
    });
    if (!profile)
      throw new ConflictException({ code: ErrorCode.UsernameTaken, message: 'That username is taken' });
    return toProfileDto(profile);
  }

  @Get('matches')
  async history(@CurrentIdentity() identity: AuthIdentity): Promise<MatchHistoryEntry[]> {
    const rows = await this.matches.historyFor(identity.userId, 30);
    return rows.map((row) => ({
      ...row,
      gameName: this.registry.get(row.gameId)?.name ?? row.gameId,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
    }));
  }
}
