<?php

namespace WebNest\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Site extends Model
{
    use SoftDeletes;
    protected $table = 'webnest_sites';
    protected $guarded = ['id'];
    protected function casts(): array { return ['settings' => 'array']; }
    public function domains(): HasMany { return $this->hasMany(Domain::class, 'site_id'); }
}
