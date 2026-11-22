<?php

namespace WebNest\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Domain extends Model
{
    use SoftDeletes;
    protected $table = 'webnest_domains';
    protected $guarded = ['id'];
    protected function casts(): array { return ['verified_at' => 'datetime']; }
    public function site(): BelongsTo { return $this->belongsTo(Site::class, 'site_id'); }
}
